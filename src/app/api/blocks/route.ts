import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { blocks, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ok, toResponse } from "@/lib/http";
import { mediaSrc } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const rows = await db
      .select({
        id: blocks.blockedId,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarKey: profiles.avatarKey,
        createdAt: blocks.createdAt,
      })
      .from(blocks)
      .innerJoin(profiles, eq(profiles.id, blocks.blockedId))
      .where(eq(blocks.blockerId, user.id))
      .orderBy(desc(blocks.createdAt))
      .limit(200);
    return ok({
      blocks: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        avatarUrl: row.avatarKey ? mediaSrc({ key: row.avatarKey }) : null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return toResponse(error);
  }
}

void and;
