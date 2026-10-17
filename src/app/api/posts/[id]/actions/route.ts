import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, savedItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { toggleLike } from "@/lib/services";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("like"), source: z.string().max(20).optional() }),
  z.object({ action: z.literal("save") }),
  z.object({ action: z.literal("unsave") }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await readBody(req, schema);
    await rateLimit(`post-action:${user.id}`, 120, 60);

    const [post] = await db.select().from(posts).where(and(eq(posts.id, id), sql`${posts.deletedAt} is null`)).limit(1);
    if (!post) throw new ApiError(404, "not_found", "Post not found");

    if (body.action === "like") {
      const result = await toggleLike({ entityType: "post", entityId: id, userId: user.id, source: body.source ?? "feed" });
      return ok(result);
    }
    if (body.action === "save") {
      await db
        .insert(savedItems)
        .values({ userId: user.id, entityType: "post", entityId: id })
        .onConflictDoNothing();
      return ok({ saved: true });
    }
    await db.delete(savedItems).where(and(eq(savedItems.userId, user.id), eq(savedItems.entityType, "post"), eq(savedItems.entityId, id)));
    return ok({ saved: false });
  } catch (error) {
    return toResponse(error);
  }
}


