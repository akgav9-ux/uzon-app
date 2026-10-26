
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, follows, videos } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ok, rateLimit, toResponse } from "@/lib/http";
import { buildVideosPayload } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const viewer = await getSessionUser(req);

    if (viewer) {
      await rateLimit(`clips:${viewer.id}`, 240, 60);
    }

    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const tag = url.searchParams.get("tag");
    const authorId = url.searchParams.get("authorId");
    const feed = url.searchParams.get("feed") === "following"
      ? "following"
      : "flow";

    const limit = Math.min(
      12,
      Math.max(1, Number(url.searchParams.get("limit") ?? 6)),
    );

    const followingRows = viewer
      ? await db
          .select({ followingId: follows.followingId })
          .from(follows)
          .where(eq(follows.followerId, viewer.id))
      : [];

    const followingIds = followingRows.map((row) => row.followingId);

    // Вкладка «Подписки» доступна только авторизованному пользователю.
    if (feed === "following" && (!viewer || followingIds.length === 0)) {
      return ok({
        clips: [],
        nextCursor: null,
      });
    }

    const conditions = [
      eq(videos.kind, "clip"),
      eq(videos.status, "ready"),
      sql`${videos.deletedAt} is null`,
      sql`(${videos.audience} = 'public' or ${videos.ownerId} = ${viewer?.id ?? sql`null`})`,
    ];

    if (cursor) {
      const cursorDate = new Date(cursor);

      if (!Number.isNaN(cursorDate.getTime())) {
        conditions.push(sql`${videos.createdAt} < ${cursorDate}`);
      }
    }

    if (authorId) {
      conditions.push(eq(videos.ownerId, authorId));
    }

    if (tag) {
      conditions.push(
        sql`${videos.hashtags} @> ${[tag.toLowerCase()]}::jsonb`,
      );
    }

    if (feed === "following") {
      conditions.push(inArray(videos.ownerId, followingIds));
    }

    if (viewer) {
      const blocked = await db
        .select({
          other: sql<string>`
            case
              when ${blocks.blockerId} = ${viewer.id}
              then ${blocks.blockedId}
              else ${blocks.blockerId}
            end
          `,
        })
        .from(blocks)
        .where(
          or(
            eq(blocks.blockerId, viewer.id),
            eq(blocks.blockedId, viewer.id),
          ),
        );

      const blockedIds = blocked
        .map((row) => row.other)
        .filter(Boolean);

      if (blockedIds.length > 0) {
        conditions.push(
          sql`${videos.ownerId} not in (${sql.join(
            blockedIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
      }
    }

    const rows = await db
      .select()
      .from(videos)
      .where(and(...conditions))
      .orderBy(
        feed === "flow"
          ? sql`(
              case
                when ${videos.ownerId} = any(
                  ${sql.raw(
                    `ARRAY[${followingIds
                      .map((id) => `'${id}'`)
                      .join(",") || "NULL"}]::uuid[]`,
                  )}
                )
                then 1
                else 0
              end
            ) desc`
          : desc(videos.createdAt),
        sql`(${videos.viewCount} + ${videos.likeCount} * 4) desc`,
        desc(videos.createdAt),
      )
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return ok({
      clips: await buildVideosPayload(page, viewer?.id ?? null),
      nextCursor:
        hasMore && page.length > 0
          ? page[page.length - 1]!.createdAt.toISOString()
          : null,
    });
  } catch (error) {
    return toResponse(error);
  }
}
