import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, posts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { buildPostsPayload } from "@/lib/serialize";
import { getRelation } from "@/lib/services";
import { evaluateAudience } from "@/lib/access";
import { audienceSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  text: z.string().max(4000).optional(),
  audience: audienceSchema.optional(),
  commentsEnabled: z.boolean().optional(),
});

async function loadPost(id: string) {
  const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!row || row.deletedAt) throw new ApiError(404, "not_found", "Post not found");
  return row;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const viewer = await getSessionUser(req);
    const row = await loadPost(id);
    if (viewer) {
      const ctx = await getRelation(viewer.id, row.authorId);
      if (!evaluateAudience(row.audience as never, ctx)) throw new ApiError(403, "forbidden", "This post is restricted");
    } else if (row.audience !== "public") {
      throw new ApiError(403, "forbidden", "Sign in to view this post");
    }
    const payload = await buildPostsPayload([row], viewer?.id ?? null);
    const commentRows = await db
      .select()
      .from(comments)
      .where(and(eq(comments.entityType, "post"), eq(comments.entityId, row.id), sql`${comments.deletedAt} is null`, sql`${comments.parentId} is null`))
      .orderBy(sql`${comments.createdAt} desc`)
      .limit(50);
    return ok({ post: payload[0], comments: commentRows.map((c) => ({
      id: c.id,
      text: c.text,
      authorId: c.authorId,
      likeCount: c.likeCount,
      createdAt: c.createdAt.toISOString(),
    })) });
  } catch (error) {
    return toResponse(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const viewer = await getSessionUser(req);
    if (!viewer) throw new ApiError(401, "unauthenticated");
    const row = await loadPost(id);
    if (row.authorId !== viewer.id && viewer.role === "user") throw new ApiError(403, "forbidden");
    const body = await readBody(req, patchSchema);
    const [updated] = await db
      .update(posts)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(posts.id, id))
      .returning();
    return ok({ post: (await buildPostsPayload([updated!], viewer.id))[0] });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const viewer = await getSessionUser(_req);
    if (!viewer) throw new ApiError(401, "unauthenticated");
    const row = await loadPost(id);
    if (row.authorId !== viewer.id && viewer.role === "user") throw new ApiError(403, "forbidden");
    await rateLimit(`delete-post:${viewer.id}`, 30, 300);
    await db.update(posts).set({ deletedAt: new Date(), text: null }).where(eq(posts.id, id));
    return ok({ deleted: true });
  } catch (error) {
    return toResponse(error);
  }
}
