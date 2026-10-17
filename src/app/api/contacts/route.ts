import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { contacts, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { mediaSrc } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function phoneHash(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

const postSchema = z.object({
  entries: z
    .array(z.object({ phoneHash: z.string().regex(/^[a-f0-9]{64}$/i), label: z.string().max(60).optional() }))
    .min(1)
    .max(500),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const rows = await db
      .select({
        id: contacts.id,
        label: contacts.label,
        invited: contacts.invited,
        createdAt: contacts.createdAt,
        matchedId: contacts.matchedUserId,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarKey: profiles.avatarKey,
      })
      .from(contacts)
      .leftJoin(profiles, eq(profiles.id, contacts.matchedUserId))
      .where(eq(contacts.ownerId, user.id))
      .orderBy(desc(contacts.createdAt))
      .limit(500);
    return ok({
      contacts: rows.map((r) => ({
        id: r.id,
        label: r.label,
        invited: r.invited,
        createdAt: r.createdAt.toISOString(),
        matched: r.matchedId
          ? {
              id: r.matchedId,
              username: r.username ?? "user",
              displayName: r.displayName ?? "UZON user",
              avatarUrl: r.avatarKey ? mediaSrc({ key: r.avatarKey ?? "" }) : null,
            }
          : null,
      })),
    });
  } catch (error) {
    return toResponse(error);
  }
}

/**
 * The client only ever uploads SHA-256 hashes of international numbers plus an
 * optional label — never the address book itself. Matching happens against
 * `profiles.phone_hash`.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`contacts:${user.id}`, 10, 3600);
    const body = await readBody(req, postSchema);

    // Lazy backfill of hashes for accounts created before this column existed.
    const missing = await db
      .select({ id: profiles.id, phone: profiles.phone })
      .from(profiles)
      .where(and(sql`${profiles.phone} is not null`, sql`${profiles.phoneHash} is null`))
      .limit(2000);
    for (const row of missing) {
      if (row.phone) await db.update(profiles).set({ phoneHash: phoneHash(row.phone) }).where(eq(profiles.id, row.id));
    }

    const hashes = Array.from(new Set(body.entries.map((e) => e.phoneHash.toLowerCase())));
    const matched = await db
      .select({ id: profiles.id, hash: profiles.phoneHash, username: profiles.username })
      .from(profiles)
      .where(inArray(sql`lower(${profiles.phoneHash})`, hashes));
    const matchedByHash = new Map(matched.map((m) => [m.hash?.toLowerCase() ?? "", m]));

    let stored = 0;
    for (const entry of body.entries) {
      const match = matchedByHash.get(entry.phoneHash.toLowerCase());
      await db
        .insert(contacts)
        .values({
          ownerId: user.id,
          phoneHash: entry.phoneHash.toLowerCase(),
          label: entry.label ?? null,
          matchedUserId: match?.id ?? null,
        })
        .onConflictDoUpdate({
          target: [contacts.ownerId, contacts.phoneHash],
          set: { label: entry.label ?? null, matchedUserId: match?.id ?? null },
        });
      stored += 1;
    }

    const rows = await db
      .select({
        id: contacts.id,
        label: contacts.label,
        matchedId: contacts.matchedUserId,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarKey: profiles.avatarKey,
      })
      .from(contacts)
      .leftJoin(profiles, eq(profiles.id, contacts.matchedUserId))
      .where(and(eq(contacts.ownerId, user.id), sql`${contacts.matchedUserId} is not null`))
      .limit(200);

    return ok({
      stored,
      matched: rows.map((r) => ({
        id: r.id,
        label: r.label,
        user: {
          id: r.matchedId,
          username: r.username ?? "user",
          displayName: r.displayName ?? "UZON user",
          avatarUrl: r.avatarKey ? mediaSrc({ key: r.avatarKey ?? "" }) : null,
        },
      })),
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) throw new ApiError(422, "missing_id");
    await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.ownerId, user.id)));
    return ok({ deleted: true });
  } catch (error) {
    return toResponse(error);
  }
}
