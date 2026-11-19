# UZON adaptive long-video worker

This worker is deliberately separate from Vercel. It processes **long videos only**; clips are never claimed by the queue.

## What it does

1. Claims one queued `video_jobs` row using PostgreSQL `FOR UPDATE SKIP LOCKED`.
2. Downloads the original object from Selectel S3.
3. Uses `ffprobe` to detect the source dimensions.
4. Creates HLS VOD renditions at 360p, 480p, 720p and 1080p, limited to the source height (no upscaling).
5. Uploads the master playlist, variant playlists and segments to `videos/<video-id>/hls/`.
6. Marks the video ready and stores its available quality levels.

The original upload is retained. This first implementation does not delete or overwrite originals.

## Server requirements

- Ubuntu 24.04 (or another supported Linux distribution)
- Node.js 22 LTS
- FFmpeg with `ffmpeg`, `ffprobe` and the `libx264` encoder
- Network access to the Supabase PostgreSQL database and Selectel S3
- At least twice the largest source-file size free on the worker temporary filesystem before a job starts; for a 3.67 GB source, the worker requires at least about 7.34 GB free. More headroom is recommended for long/high-bitrate videos

Install FFmpeg and Node.js 22 using your server provider's supported packages/repositories. In the repository checkout, run `npm ci`.

## Environment

Set these variables in the worker's private environment (for example, a root-readable systemd EnvironmentFile). Do not commit them or paste credentials into chat:

- `DATABASE_URL` — Supabase PostgreSQL connection string; use the direct/session-compatible connection string permitted for a long-running worker
- `S3_ENDPOINT=https://s3.ru-7.storage.selcloud.ru`
- `S3_REGION=ru-7`
- `S3_BUCKET=uzon-media`
- `S3_ACCESS_KEY` — Selectel access key
- `S3_SECRET_KEY` — Selectel secret key
- `VIDEO_WORKER_POLL_MS=5000` (optional)

Use a dedicated Selectel key restricted to this bucket where possible. The worker needs read access to original uploads and write access to HLS output keys.

## Start

```bash
npm run worker:video
```

Run it under systemd or another process supervisor so it restarts after a server reboot. Keep the worker to one process initially; each job is CPU- and disk-intensive.

## Selectel bucket settings

The browser must be able to GET the HLS master playlist, variant playlists and segments from the same public media origin used by existing UZON media URLs. Configure bucket/object read access and CORS to allow GET and HEAD from the UZON web origins. Do not make the bucket writable by anonymous users. The worker uploads objects using its private S3 credentials. It does **not** set an object ACL. Confirm the actual bucket policy in Selectel before processing: the browser must have anonymous `GET`/`HEAD` access to the generated HLS keys (or the application must be changed to issue signed URLs). Prefer a bucket policy that grants read-only access to the HLS prefix; never enable anonymous writes. Do not assume that a documentation statement or an ACL setting makes the objects public—verify by requesting a real uploaded `.m3u8` URL without credentials.

## Database rollout

The Drizzle schema and migration add `videos.hls_key` and `videos.quality_levels`. Apply the schema change to the database before enabling the worker. The migration file is `drizzle/0001_video_hls.sql`. Do not run a production migration until the branch has been reviewed and tested.

## Playback

The video page uses HLS.js in browsers without native HLS and falls back to the original progressive MP4 if HLS.js cannot load. Safari uses native HLS adaptive playback. Manual quality selection is available when HLS.js exposes rendition levels; native Safari playback remains automatic.

## Current limitations

- This is a first worker implementation, not yet production-validated against the live Selectel bucket, Supabase connection, real source videos, or mobile browsers.
- Jobs are retried up to three attempts. A worker heartbeat refreshes active jobs; stale jobs older than 15 minutes are requeued or marked failed after the retry limit. There is no exponential backoff yet.
- The worker checks free temporary disk space before downloading a source. It uploads each rendition as soon as it is encoded, removes that rendition's temporary files, and streams S3 uploads rather than buffering full segments in RAM.
- FFmpeg progress is written to `video_jobs.progress`; the video detail page polls the job every five seconds while it is queued or processing.
- The worker does not yet generate thumbnails, subtitles, or 1440p/4K renditions.
- Original uploads are kept, so HLS renditions require additional storage.


## Recovery and retries

The worker refreshes the active job heartbeat every 60 seconds. Jobs left in `processing` for more than 15 minutes are requeued on the next worker poll. Each job is attempted up to three times; repeated failures are marked `failed` and shown on the video record. Apply migration `0002_video_job_retries.sql` before starting the updated worker.
