import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { calls, conversationMembers, conversations, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getServerConfig } from "@/lib/config";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { canCall } from "@/lib/access";
import { assertBlockedPair, getRelation, notify } from "@/lib/services";
import { callCreateSchema } from "@/lib/validation";
import { publicConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "inbox";

    if (scope === "inbox") {
      const incoming = await db
        .select({
          call: calls,
          initiatorName: profiles.displayName,
          initiatorUsername: profiles.username,
          initiatorAvatar: profiles.avatarKey,
        })
        .from(calls)
        .leftJoin(profiles, eq(profiles.id, calls.initiatorId))
        .where(and(eq(calls.calleeId, user.id), eq(calls.status, "ringing"), sql`${calls.createdAt} > now() - interval '2 minutes'`))
        .orderBy(desc(calls.createdAt))
        .limit(5);
      const config = await getServerConfig();
      return ok({
        incoming: incoming.map((row) => ({
          id: row.call.id,
          kind: row.call.kind,
          status: row.call.status,
          createdAt: row.call.createdAt.toISOString(),
          peer: {
            id: row.call.initiatorId,
            displayName: row.initiatorName ?? "UZON user",
            username: row.initiatorUsername ?? "user",
            avatarUrl: row.initiatorAvatar ? `/api/media/${row.initiatorAvatar}` : null,
          },
        })),
        iceServers: publicConfig(config).iceServers,
      });
    }

    const rows = await db
      .select({
        call: calls,
        peerName: profiles.displayName,
        peerUsername: profiles.username,
        peerAvatar: profiles.avatarKey,
      })
      .from(calls)
      .leftJoin(profiles, eq(profiles.id, sql`case when ${calls.initiatorId} = ${user.id} then ${calls.calleeId} else ${calls.initiatorId} end`))
      .where(or(eq(calls.initiatorId, user.id), eq(calls.calleeId, user.id)))
      .orderBy(desc(calls.createdAt))
      .limit(40);

    return ok({
      history: rows.map((row) => ({
        id: row.call.id,
        kind: row.call.kind,
        status: row.call.status,
        direction: row.call.initiatorId === user.id ? "outgoing" : "incoming",
        durationMs: row.call.durationMs,
        createdAt: row.call.createdAt.toISOString(),
        endedAt: row.call.endedAt?.toISOString() ?? null,
        peer: {
          id: row.call.initiatorId === user.id ? row.call.calleeId : row.call.initiatorId,
          displayName: row.peerName ?? "UZON user",
          username: row.peerUsername ?? "user",
          avatarUrl: row.peerAvatar ? `/api/media/${row.peerAvatar}` : null,
        },
      })),
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`call:${user.id}`, 12, 300);
    const body = await readBody(req, callCreateSchema);
    if (body.calleeId === user.id) throw new ApiError(422, "self_call", "You cannot call yourself");

    const [callee] = await db.select().from(profiles).where(eq(profiles.id, body.calleeId)).limit(1);
    if (!callee || callee.status !== "active") throw new ApiError(404, "not_found", "User not found");
    await assertBlockedPair(user.id, body.calleeId);

    const { privacySettings } = await import("@/db/schema");
    const [privacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, callee.id)).limit(1);
    const ctx = await getRelation(user.id, callee.id, "whoCanCall");
    
    const whoCanCall = privacy?.whoCanCall ?? "everyone"; 
    
    if (!canCall(whoCanCall as never, ctx)) {
      throw new ApiError(403, "calls_restricted", "This user does not accept calls from you");
    }

    if (body.conversationId) {
      const [member] = await db
        .select()
        .from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, body.conversationId), eq(conversationMembers.userId, user.id)))
        .limit(1);
      if (!member) throw new ApiError(403, "not_a_member", "You are not a member of this conversation");
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, body.conversationId)).limit(1);
      if (conversation?.kind === "channel") throw new ApiError(422, "not_supported", "Channels do not support calls");
    }

    await db
      .update(calls)
      .set({ status: "missed", endedAt: new Date(), endedReason: "timeout" })
      .where(and(eq(calls.status, "ringing"), sql`${calls.createdAt} < now() - interval '2 minutes'`));

    const [call] = await db
      .insert(calls)
      .values({
        conversationId: body.conversationId ?? null,
        initiatorId: user.id,
        calleeId: body.calleeId,
        kind: body.kind,
        status: "ringing",
      })
      .returning();

    await notify({
      userId: body.calleeId,
      type: "call",
      actorId: user.id,
      entityType: "call",
      entityId: call!.id,
      preview: body.kind,
      category: "calls",
    });

    return ok({ call: serialize(call!), iceServers: publicConfig(await getServerConfig()).iceServers }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}

function serialize(call: typeof calls.$inferSelect) {
  return {
    id: call.id,
    kind: call.kind,
    status: call.status,
    initiatorId: call.initiatorId,
    calleeId: call.calleeId,
    conversationId: call.conversationId,
    createdAt: call.createdAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationMs: call.durationMs,
  };
}