import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { media, videos, videoJobs } from "@/db/schema";
import { mediaSrc } from "@/lib/media";
import { assertVideoWorker } from "@/lib/video-worker-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!assertVideoWorker(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const job = await db.transaction(async (tx) => {
      const [candidate] = await tx.select({
        jobId: videoJobs.id,
        videoId: videos.id,
        mediaKey: media.key,
        remoteUrl: media.remoteUrl,
      }).from(videoJobs)
        .innerJoin(videos, eq(videos.id, videoJobs.videoId))
        .innerJoin(media, eq(media.id, videos.mediaId))
        .where(and(
          eq(videoJobs.status, "queued"),
          eq(videos.kind, "long"),
          eq(videos.audience, "public"),
          eq(videos.status, "processing"),
        ))
        .orderBy(asc(videoJobs.createdAt))
        .for("update", { of: videoJobs, skipLocked: true })
        .limit(1);
      if (!candidate) return null;
      await tx.update(videoJobs).set({ status: "processing", stage: "transcode", progress: 5, updatedAt: new Date() }).where(eq(videoJobs.id, candidate.jobId));
      return candidate;
    });
    if (!job) return NextResponse.json({ job: null });
    return NextResponse.json({
      job: {
        jobId: job.jobId,
        videoId: job.videoId,
        sourceUrl: job.remoteUrl || mediaSrc({ key: job.mediaKey }),
      },
    });
  } catch (error) {
    console.error("Video worker claim failed:", error);
    return NextResponse.json({ error: "Could not claim video job" }, { status: 500 });
  }
}
