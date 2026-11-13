import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const required = ["DATABASE_URL", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const bucket = process.env.S3_BUCKET || "uzon-media";
const region = process.env.S3_REGION || "ru-7";
const endpoint = process.env.S3_ENDPOINT || "https://s3.ru-7.storage.selcloud.ru";
const pollMs = Math.max(1000, Number(process.env.VIDEO_WORKER_POLL_MS || 5000));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 });
const s3 = new S3Client({
  region,
  endpoint,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
  maxAttempts: 5,
  requestHandler: new NodeHttpHandler({
  connectionTimeout: 30_000,
  requestTimeout: 300_000,
}),
});

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.slice(-5000) || `${command} exited ${code}`)));
  });
}

async function recoverStaleJobs() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      UPDATE video_jobs
      SET status = 'queued', stage = 'queued', progress = 0,
          error = COALESCE(error, 'Worker stopped before finishing; job requeued'),
          updated_at = now()
      WHERE status = 'processing'
        AND updated_at < now() - interval '15 minutes'
        AND attempts < 3
    `);
    await client.query(`
      UPDATE video_jobs
      SET status = 'failed', stage = 'failed',
          error = COALESCE(error, 'Worker stopped repeatedly; retry limit reached'),
          updated_at = now()
      WHERE status = 'processing'
        AND updated_at < now() - interval '15 minutes'
        AND attempts >= 3
    `);
    await client.query(`
      UPDATE videos v
      SET status = 'failed',
          processing_note = 'Video processing stopped repeatedly. Please contact support.',
          updated_at = now()
      FROM video_jobs j
      WHERE j.video_id = v.id AND j.status = 'failed'
        AND v.status = 'processing'
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function claimJob() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT j.id AS job_id, j.video_id, j.attempts, v.owner_id, m.key AS source_key
      FROM video_jobs j
      JOIN videos v ON v.id = j.video_id
      JOIN media m ON m.id = v.media_id
      WHERE j.status = 'queued' AND v.kind = 'long' AND v.deleted_at IS NULL
        AND m.remote_url IS NULL AND m.key NOT LIKE 'http://%' AND m.key NOT LIKE 'https://%'
      ORDER BY j.created_at
      LIMIT 1
      FOR UPDATE OF j SKIP LOCKED
    `);
    if (!result.rows.length) {
      await client.query("COMMIT");
      return null;
    }
    const job = result.rows[0];
    await client.query(
      "UPDATE video_jobs SET status = 'processing', stage = 'probing', progress = 5, attempts = attempts + 1, error = NULL, updated_at = now() WHERE id = $1",
      [job.job_id],
    );
    await client.query(
      "UPDATE videos SET status = 'processing', processing_note = 'Preparing adaptive qualities', updated_at = now() WHERE id = $1",
      [job.video_id],
    );
    await client.query("COMMIT");
    return job;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


async function uploadTree(localDir, prefix) {
  const entries = await readdir(localDir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(localDir, entry.name);

    if (entry.isDirectory()) {
      await uploadTree(full, `${prefix}/${entry.name}`);
      continue;
    }

    const key = `${prefix}/${entry.name}`;
    const mime = entry.name.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : entry.name.endsWith(".ts")
        ? "video/mp2t"
        : "application/octet-stream";

    const body = await readFile(full);

    console.log(
      `[video-worker] uploading ${key} (${body.length} bytes)`
    );

    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: mime,
        // Match VIDEO_WORKER.md: generated HLS objects are publicly readable.
        ACL: "public-read",
        CacheControl: entry.name.endsWith(".m3u8")
          ? "public, max-age=60"
          : "public, max-age=31536000, immutable",
      }));

      console.log(`[video-worker] uploaded ${key}`);
    } catch (error) {
      console.error(`[video-worker] upload failed ${key}`, {
        name: error?.name,
        message: error?.message,
        code: error?.Code ?? error?.code,
        httpStatusCode: error?.$metadata?.httpStatusCode,
        attempts: error?.$metadata?.attempts,
      });

      throw error;
    }
  }
}



async function transcode(job) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "uzon-hls-"));
  const source = path.join(temp, "source");
  const output = path.join(temp, "hls");
  try {
    await mkdir(output, { recursive: true });
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: job.source_key }));
    if (!object.Body) throw new Error("S3 returned an empty source object");
    await pipeline(object.Body, createWriteStream(source));

    const probe = JSON.parse(await run("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
      "-of", "json", source,
    ]));
    const sourceHeight = Number(probe.streams?.[0]?.height || 0);
    const sourceWidth = Number(probe.streams?.[0]?.width || 0);
    if (!sourceHeight || !sourceWidth) throw new Error("Could not detect source video dimensions");

    const heights = [360, 480, 720, 1080].filter((height) => height <= sourceHeight);
    if (!heights.length) heights.push(sourceHeight);
    const variants = [];
    for (let index = 0; index < heights.length; index += 1) {
      const height = heights[index];
      const progress = 10 + Math.round((index / heights.length) * 65);
      await pool.query(
        "UPDATE video_jobs SET stage = 'transcode', progress = $2, updated_at = now() WHERE id = $1 AND status = 'processing'",
        [job.job_id, progress],
      );
      const name = `${height}p`;
      const folder = path.join(output, name);
      await mkdir(folder, { recursive: true });
      const bitrate = height <= 360 ? ["800k", "900k"] : height <= 480 ? ["1400k", "1600k"] : height <= 720 ? ["2800k", "3000k"] : ["5000k", "5200k"];
      await run("ffmpeg", [
        "-y", "-i", source, "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", `scale=-2:${height}:flags=lanczos`,
        "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main",
        "-b:v", bitrate[0], "-maxrate", bitrate[0], "-bufsize", bitrate[1],
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ac", "2",
        "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
        "-hls_segment_filename", path.join(folder, "segment_%05d.ts"),
        path.join(folder, "index.m3u8"),
      ]);
      const width = Math.max(2, Math.round((sourceWidth * height / sourceHeight) / 2) * 2);
      variants.push({ height, width, bandwidth: Number.parseInt(bitrate[0], 10) * 1000 + 128000, name });
    }

    const master = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      ...variants.flatMap((variant) => [
        `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.width}x${variant.height},NAME="${variant.name}"`,
        `${variant.name}/index.m3u8`,
      ]),
      "",
    ].join("\n");
    await writeFile(path.join(output, "master.m3u8"), master, "utf8");

    const prefix = `videos/${job.video_id}/hls`;
    await uploadTree(output, prefix);
    await pool.query(
      "UPDATE videos SET hls_key = $2, quality_levels = $3::jsonb, status = 'ready', processing_note = NULL, updated_at = now() WHERE id = $1",
      [job.video_id, `${prefix}/master.m3u8`, JSON.stringify(heights)],
    );
    await pool.query(
      "UPDATE video_jobs SET status = 'ready', stage = 'done', progress = 100, error = NULL, updated_at = now() WHERE id = $1",
      [job.job_id],
    );
    console.log(`[video-worker] ready video=${job.video_id} qualities=${heights.join(",")}`);
  } finally {
    await rm(temp, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 1000,
}).catch((error) => {
  console.warn(`[video-worker] temp cleanup warning: ${error.message}`);
});
  }
}

async function main() {
  console.log("[video-worker] started; waiting for long-video jobs");
  while (!stopping) {
    try {
      console.log("[video-worker] checking database...");
await recoverStaleJobs();
console.log("[video-worker] database recovery OK");

const job = await claimJob();

if (!job) {
  console.log("[video-worker] no eligible queued jobs");
  await new Promise((resolve) => setTimeout(resolve, pollMs));
  continue;
}

console.log(`[video-worker] CLAIMED job=${job.job_id} video=${job.video_id}`);
      const heartbeat = setInterval(() => {
        void pool.query("UPDATE video_jobs SET updated_at = now() WHERE id = $1 AND status = 'processing'", [job.job_id])
          .catch((error) => console.error("[video-worker] heartbeat failed", error));
      }, 60_000);
      try {
        await transcode(job);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 4000) : "Unknown transcoding error";
        const retry = Number(job.attempts || 0) + 1 < 3;
        await pool.query(
          "UPDATE video_jobs SET status = $2, stage = $3, progress = 0, error = $4, updated_at = now() WHERE id = $1",
          [job.job_id, retry ? "queued" : "failed", retry ? "queued" : "failed", message],
        );
        await pool.query(
          "UPDATE videos SET status = $2, processing_note = $3, updated_at = now() WHERE id = $1",
          [job.video_id, retry ? "processing" : "failed", retry ? "Retrying video processing" : "Video processing failed after 3 attempts. Please contact support."],
        );
        console.error(`[video-worker] ${retry ? "retry queued" : "failed"} video=${job.video_id}`, message);
      } finally {
        clearInterval(heartbeat);
      }
    } catch (error) {
      console.error("[video-worker] queue error", error);
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
  await pool.end();
  s3.destroy();
  console.log("[video-worker] stopped");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
