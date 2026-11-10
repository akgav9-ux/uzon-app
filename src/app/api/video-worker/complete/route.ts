import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { videos, videoJobs } from "@/db/schema";
import { assertVideoWorker } from "@/lib/video-worker-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!assertVideoWorker(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (typeof body.jobId !== "string" || typeof body.videoId !== "string" ||
        typeof body.outputKey !== "string" ||
        !/^hls\/[0-9a-f-]{36}\/master\.m3u8$/i.test(body.outputKey)) {
      return NextResponse.json({ error: "Invalid job payload" }, { status: 400 });
    }
    await db.transaction(async (tx) => {
      const [job] = await tx.select({ id: videoJobs.id, videoId: videoJobs.videoId })
        .from(videoJobs).where(and(eq(videoJobs.id, body.jobId), eq(videoJobs.videoId, body.videoId))).limit(1);
      if (!job) throw new Error("Video job not found");
      await tx.update(videoJobs).set({
        status: "ready", stage: "done", progress: 100, outputKey: body.outputKey,
        error: null, updatedAt: new Date(),
      }).where(eq(videoJobs.id, job.id));
      await tx.update(videos).set({
        status: "ready", processingNote: "Adaptive HLS streaming is ready", updatedAt: new Date(),
      }).where(eq(videos.id, job.videoId));
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Video worker completion failed:", error);
    return NextResponse.json({ error: "Could not complete video job" }, { status: 500 });
  }
}
