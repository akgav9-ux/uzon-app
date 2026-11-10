import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
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
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  forcePathStyle: false,
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

async function claimJob() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT j.id AS job_id, j.video_id, v.owner_id, m.key AS source_key
      FROM video_jobs j
      JOIN videos v ON v.id = j.video_id
      JOIN media m ON m.id = v.media_id
      WHERE j.status = 'queued' AND v.kind = 'long' AND v.deleted_at IS NULL
      ORDER BY j.created_at
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    `);
    if (!result.rows.length) {
      await client.query("COMMIT");
      return null;
    }
    const job = result.rows[0];
    await client.query(
      "UPDATE video_jobs SET status = 'processing', stage = 'probing', progress = 5, error = NULL, updated_at = now() WHERE id = $1",
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
    const mime = entry.name.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : entry.name.endsWith(".ts") ? "video/mp2t" : "application/octet-stream";
    const info = await stat(full);
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(full),
      ContentLength: info.size,
      ContentType: mime,
      CacheControl: entry.name.endsWith(".m3u8") ? "public, max-age=60" : "public, max-age=31536000, immutable",
    }));
  }
}

import { createReadStream } from "node:fs";

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
    for (const height of heights) {
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
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path.join(output, "master.m3u8"), master, "utf8"));

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
    await rm(temp, { recursive: true, force: true });
  }
}

async function main() {
  console.log("[video-worker] started; waiting for long-video jobs");
  while (!stopping) {
    try {
      const job = await claimJob();
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        continue;
      }
      try {
        await transcode(job);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 4000) : "Unknown transcoding error";
        await pool.query("UPDATE video_jobs SET status = 'failed', stage = 'failed', error = $2, updated_at = now() WHERE id = $1", [job.job_id, message]);
        await pool.query("UPDATE videos SET status = 'failed', processing_note = 'Video processing failed. Please contact support.', updated_at = now() WHERE id = $1", [job.video_id]);
        console.error(`[video-worker] failed video=${job.video_id}`, message);
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
