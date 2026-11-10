# UZON long-video HLS worker

This worker is intentionally separate from Vercel. It polls the authenticated
Next.js worker API, downloads a public long-video source from Selectel, creates
HLS renditions up to the source resolution (360p/480p/720p/1080p), uploads the
playlist and segments to the same S3 bucket, and reports completion.

Required environment:
- `UZON_WORKER_API_URL`: e.g. https://uzon-app.vercel.app
- `UZON_WORKER_TOKEN`: same random secret as `VIDEO_WORKER_TOKEN` in Vercel
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`

Run:
```sh
docker build -t uzon-video-worker ./video-worker
docker run --restart unless-stopped --env-file .env uzon-video-worker
```

Only public long videos are claimed. Clips and restricted videos are never
submitted to this worker. Existing original uploads are not deleted. HLS output
is additive, so the original remains the fallback until playback support is
enabled and verified.

Use a private worker token and restrict VPS firewall access. The source object
must be readable by the worker; the current public media URL is used for input.
