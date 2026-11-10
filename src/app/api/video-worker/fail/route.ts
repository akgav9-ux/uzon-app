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
    if (typeof body.jobId !== "string" || typeof body.videoId !== "string") {
      return NextResponse.json({ error: "Invalid job payload" }, { status: 400 });
    }
    const message = typeof body.error === "string" ? body.error.slice(0, 1000) : "Video processing failed";
    await db.transaction(async (tx) => {
      await tx.update(videoJobs).set({
        status: "failed", stage: "failed", error: message, updatedAt: new Date(),
      }).where(and(eq(videoJobs.id, body.jobId), eq(videoJobs.videoId, body.videoId)));
      // Keep the original file playable if transcoding fails.
      await tx.update(videos).set({
        status: "ready", processingNote: "Adaptive processing failed; original video remains available", updatedAt: new Date(),
      }).where(eq(videos.id, body.videoId));
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Video worker failure report failed:", error);
    return NextResponse.json({ error: "Could not record video failure" }, { status: 500 });
  }
}
