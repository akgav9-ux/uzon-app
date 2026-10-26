import { and, eq, sql, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { calls, notifications, profiles, callSignals } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("end") }),
]);

async function load(id: string) {
  const [row] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  if (!row) throw new ApiError(404, "not_found", "Call not found");
  return row;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const call = await load(id);
    
    if (call.initiatorId !== user.id && call.calleeId !== user.id) {
      throw new ApiError(403, "forbidden");
    }

    const [peer] = await db
      .select({ displayName: profiles.displayName, username: profiles.username, avatarKey: profiles.avatarKey })
      .from(profiles)
      .where(eq(profiles.id, call.initiatorId === user.id ? call.calleeId : call.initiatorId))
      .limit(1);

    return ok({
      call: {
        id: call.id,
        kind: call.kind,
        status: call.status,
        initiatorId: call.initiatorId,
        calleeId: call.calleeId,
        durationMs: call.durationMs,
        createdAt: call.createdAt.toISOString(),
        answeredAt: call.answeredAt?.toISOString() ?? null,
        endedAt: call.endedAt?.toISOString() ?? null,
        isInitiator: call.initiatorId === user.id,
        endedReason: call.endedReason,
      },
      peer: peer
        ? {
            displayName: peer.displayName,
            username: peer.username,
            avatarUrl: peer.avatarKey ? `/api/media/${peer.avatarKey}` : null,
          }
        : null,
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await readBody(req, schema);
    await rateLimit(`call-state:${user.id}`, 60, 60);
    const call = await load(id);

    if (call.initiatorId !== user.id && call.calleeId !== user.id) {
      throw new ApiError(403, "forbidden");
    }

    if (body.action === "accept") {
      if (call.calleeId !== user.id) throw new ApiError(403, "forbidden", "Only the callee can accept");
      if (call.status !== "ringing") throw new ApiError(409, "call_not_ringing", "The call is no longer ringing");
      
      const [updated] = await db
        .update(calls)
        .set({ status: "active", answeredAt: new Date() })
        .where(and(eq(calls.id, id), eq(calls.status, "ringing")))
        .returning();

      if (!updated) throw new ApiError(409, "call_already_handled", "This call was already accepted or finished");

      return ok({ status: "active", answeredAt: updated.answeredAt?.toISOString() ?? null });
    }

    if (body.action === "decline") {
      if (call.status !== "ringing") throw new ApiError(409, "call_not_ringing", "The call is no longer ringing");
      
      const [updated] = await db
        .update(calls)
        .set({ status: "declined", endedAt: new Date(), endedReason: "declined" })
        .where(and(eq(calls.id, id), eq(calls.status, "ringing")))
        .returning();

      if (!updated) throw new ApiError(409, "call_already_handled", "This call was already accepted or finished");

      // 🔥 ДОБАВЛЕНО: Сигнал об отклонении для второго участника
      await db.insert(callSignals).values({
        callId: id,
        fromUserId: user.id,
        type: "decline",
        payload: {},
      });

      await notifyPeer(call.initiatorId === user.id ? call.calleeId : call.initiatorId, user.id, id, "declined");
      return ok({ status: "declined" });
    }

    const durationMs = call.answeredAt ? Math.max(0, Date.now() - call.answeredAt.getTime()) : 0;
    
    const [updated] = await db
      .update(calls)
      .set({ status: "ended", endedAt: new Date(), endedReason: "hangup", durationMs })
      .where(and(eq(calls.id, id), ne(calls.status, "ended")))
      .returning();

    if (!updated) throw new ApiError(409, "call_already_ended", "This call has already been ended");

    // 🔥 ДОБАВЛЕНО: Сигнал о завершении для второго участника
    await db.insert(callSignals).values({
      callId: id,
      fromUserId: user.id,
      type: "end",
      payload: {},
    });

    await notifyPeer(call.initiatorId === user.id ? call.calleeId : call.initiatorId, user.id, id, "ended");
    return ok({ status: "ended", durationMs });
  } catch (error) {
    return toResponse(error);
  }
}

async function notifyPeer(peerId: string, actorId: string, callId: string, type: "declined" | "ended") {
  await db.insert(notifications).values({
    userId: peerId,
    type: type === "declined" ? "missedCall" : "call",
    actorId,
    entityType: "call",
    entityId: callId,
    groupKey: `call:${callId}:${type}`,
  });
}

void sql;