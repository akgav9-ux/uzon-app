import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { bumpCommentCount, toggleLike } from "@/lib/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("like") })]);

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    await readBody(req, schema);
    await rateLimit(`comment-like:${user.id}`, 120, 60);
    const [row] = await db.select().from(comments).where(and(eq(comments.id, id), sql`${comments.deletedAt} is null`)).limit(1);
    if (!row) throw new ApiError(404, "not_found", "Comment not found");
    return ok(await toggleLike({ entityType: "comment", entityId: id, userId: user.id }));
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const [row] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
    if (!row) throw new ApiError(404, "not_found", "Comment not found");
    const isModerator = user.role === "admin" || user.role === "moderator";
    if (row.authorId !== user.id && !isModerator) throw new ApiError(403, "forbidden");
    await db.update(comments).set({ deletedAt: new Date(), text: "[removed]" }).where(eq(comments.id, id));
    await bumpCommentCount(row.entityType as "post" | "video", row.entityId, -1);
    return ok({ deleted: true });
  } catch (error) {
    return toResponse(error);
  }
}
