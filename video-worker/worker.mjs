import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const api = (process.env.UZON_WORKER_API_URL || "").replace(/\/$/, "");
const token = process.env.UZON_WORKER_TOKEN;
const bucket = process.env.S3_BUCKET;
const s3 = new S3Client({
  region: process.env.S3_REGION || "ru-7",
  endpoint: process.env.S3_ENDPOINT || "https://s3.ru-7.storage.selcloud.ru",
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
});

if (!api || !token || !bucket || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
  throw new Error("Missing UZON worker or S3 environment variables");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.slice(-5000) || command + " failed")));
  });
}

async function report(pathname, body) {
  const response = await fetch(api + pathname, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Worker API " + response.status + ": " + (await response.text()).slice(0, 1000));
  return response.json();
}

async function processJob(job) {
  const dir = await mkdtemp(path.join(tmpdir(), "uzon-video-"));
  try {
    const input = path.join(dir, "source");
    const response = await fetch(job.sourceUrl);
    if (!response.ok || !response.body) throw new Error("Could not download source video: " + response.status);
    await writeFile(input, Buffer.from(await response.arrayBuffer()));

    const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "json", input]));
    const sourceHeight = Number(probe.streams?.[0]?.height || 0);
    if (!sourceHeight) throw new Error("Source has no readable video stream");

    const variants = [
      { height: 360, bandwidth: 800000, name: "360p" },
      { height: 480, bandwidth: 1400000, name: "480p" },
      { height: 720, bandwidth: 2800000, name: "720p" },
      { height: 1080, bandwidth: 5000000, name: "1080p" },
    ].filter((v) => v.height <= sourceHeight);
    if (!variants.length) variants.push({ height: sourceHeight, bandwidth: 500000, name: sourceHeight + "p" });

    const outputRoot = path.join(dir, "hls");
    await mkdir(outputRoot, { recursive: true });
    const master = ["#EXTM3U", "#EXT-X-VERSION:3"];
    for (const variant of variants) {
      const folder = path.join(outputRoot, variant.name);
      await mkdir(folder, { recursive: true });
      const playlist = path.join(folder, "index.m3u8");
      await run("ffmpeg", [
        "-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", `scale=-2:${variant.height}:force_original_aspect_ratio=decrease`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ac", "2",
        "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
        "-hls_segment_filename", path.join(folder, "segment_%05d.ts"), playlist,
      ]);
      master.push(`#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=0x${variant.height}`);
      master.push(`${variant.name}/index.m3u8`);
    }
    await writeFile(path.join(outputRoot, "master.m3u8"), master.join("\n") + "\n");

    const prefix = `hls/${job.videoId}/`;
    async function uploadTree(folder, relative = "") {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const absolute = path.join(folder, entry.name);
        const rel = path.posix.join(relative, entry.name);
        if (entry.isDirectory()) await uploadTree(absolute, rel);
        else {
          const ext = path.extname(entry.name);
          const contentType = ext === ".m3u8" ? "application/vnd.apple.mpegurl" : ext === ".ts" ? "video/mp2t" : "application/octet-stream";
          await s3.send(new PutObjectCommand({
            Bucket: bucket, Key: prefix + rel.split(path.sep).join("/"),
            Body: await readFile(absolute), ContentType: contentType,
            CacheControl: "public, max-age=31536000, immutable",
          }));
        }
      }
    }
    await uploadTree(outputRoot);
    await report("/api/video-worker/complete", { jobId: job.jobId, videoId: job.videoId, outputKey: prefix + "master.m3u8" });
  } catch (error) {
    await report("/api/video-worker/fail", { jobId: job.jobId, videoId: job.videoId, error: String(error).slice(0, 1000) }).catch(() => undefined);
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function loop() {
  while (true) {
    try {
      const result = await report("/api/video-worker/claim", {});
      if (result.job) {
        console.log("Processing video", result.job.videoId);
        await processJob(result.job);
        console.log("Completed video", result.job.videoId);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(error);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}

loop();
