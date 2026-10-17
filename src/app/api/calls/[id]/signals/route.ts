import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { callSignals, calls } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { callSignalSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * WebRTC signalling relay. Offer/answer/ICE payloads are stored per call and
 * consumed exactly once by the peer (polling interval ~1s on the client).
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const [call] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
    if (!call) throw new ApiError(404, "not_found", "Call not found");
    if (call.initiatorId !== user.id && call.calleeId !== user.id) throw new ApiError(403, "forbidden");

    const rows = await db
      .select()
      .from(callSignals)
      .where(
        and(
          eq(callSignals.callId, id),
          sql`${callSignals.fromUserId} <> ${user.id}`,
          isNull(callSignals.consumedAt),
        ),
      )
      .orderBy(asc(callSignals.createdAt))
      .limit(50);

    if (rows.length) {
      await db
        .update(callSignals)
        .set({ consumedAt: new Date() })
        .where(sql`${callSignals.id} = any(${sql.raw(`ARRAY[${rows.map((r) => `'${r.id}'`).join(",")}]::uuid[]`)})`);
    }

    // A ringing call older than 90 seconds without an answer is missed.
    let status = call.status;
    if (call.status === "ringing" && Date.now() - call.createdAt.getTime() > 90_000) {
      await db.update(calls).set({ status: "missed", endedAt: new Date(), endedReason: "timeout" }).where(eq(calls.id, id));
      status = "missed";
    }

    return ok({
      status,
      signals: rows.map((r) => ({ id: r.id, type: r.type, payload: r.payload, fromUserId: r.fromUserId, createdAt: r.createdAt.toISOString() })),
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await readBody(req, callSignalSchema);
    await rateLimit(`signal:${user.id}`, 300, 60);
    const [call] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
    if (!call) throw new ApiError(404, "not_found", "Call not found");
    if (call.initiatorId !== user.id && call.calleeId !== user.id) throw new ApiError(403, "forbidden");
    if (["ended", "missed", "declined", "failed"].includes(call.status) && body.type !== "end") {
      throw new ApiError(410, "call_finished", "The call has already finished");
    }

    if (body.type === "offer" && user.id !== call.initiatorId) throw new ApiError(403, "forbidden", "Only the initiator sends the offer");
    if (body.type === "answer" && user.id !== call.calleeId) throw new ApiError(403, "forbidden", "Only the callee sends the answer");

    const payload = (body.payload ?? {}) as Record<string, unknown>;
    if (JSON.stringify(payload).length > 20_000) throw new ApiError(413, "payload_too_large", "Signalling payload is too large");

    await db.insert(callSignals).values({
      callId: id,
      fromUserId: user.id,
      type: body.type,
      payload,
    });

    if (body.type === "accept") {
      await db.update(calls).set({ status: "active", answeredAt: new Date() }).where(and(eq(calls.id, id), eq(calls.status, "ringing")));
    }
    if (body.type === "end") {
      const durationMs = call.answeredAt ? Date.now() - call.answeredAt.getTime() : 0;
      await db.update(calls).set({ status: "ended", endedAt: new Date(), durationMs, endedReason: "hangup" }).where(eq(calls.id, id));
    }
    return ok({ queued: true });
  } catch (error) {
    return toResponse(error);
  }
}
