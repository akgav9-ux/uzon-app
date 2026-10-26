import { and, asc, eq, isNull, ne, inArray } from "drizzle-orm";
import { db } from "@/db";
import { callSignals, calls } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { callSignalSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const FINISHED_STATUSES = ["ended", "missed", "declined", "failed"] as const;
const MAX_SIGNAL_PAYLOAD_LENGTH = 20_000;
const MAX_SIGNALS_PER_POLL = 50;
const MISSED_CALL_TIMEOUT_MS = 90_000;

export async function GET(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;

    const [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.id, id))
      .limit(1);

    if (!call) throw new ApiError(404, "not_found", "Call not found");

    const isParticipant = call.initiatorId === user.id || call.calleeId === user.id;
    if (!isParticipant) throw new ApiError(403, "forbidden");

    let status = call.status;

    if (call.status === "ringing" && Date.now() - call.createdAt.getTime() > MISSED_CALL_TIMEOUT_MS) {
      await db
        .update(calls)
        .set({ status: "missed", endedAt: new Date(), endedReason: "timeout" })
        .where(and(eq(calls.id, id), eq(calls.status, "ringing")));
      status = "missed";
    }

    const rows = await db
      .select()
      .from(callSignals)
      .where(
        and(
          eq(callSignals.callId, id),
          ne(callSignals.fromUserId, user.id),
          isNull(callSignals.consumedAt),
        ),
      )
      .orderBy(asc(callSignals.createdAt))
      .limit(MAX_SIGNALS_PER_POLL);

    if (rows.length > 0) {
      const rowIds = rows.map((row) => row.id);
      await db
        .update(callSignals)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(callSignals.callId, id),
            isNull(callSignals.consumedAt),
            inArray(callSignals.id, rowIds),
          ),
        );
    }

    return ok({
      status,
      signals: rows.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        fromUserId: row.fromUserId,
        createdAt: row.createdAt.toISOString(),
      })),
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

    const [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.id, id))
      .limit(1);

    if (!call) throw new ApiError(404, "not_found", "Call not found");

    const isInitiator = call.initiatorId === user.id;
    const isCallee = call.calleeId === user.id;

    if (!isInitiator && !isCallee) throw new ApiError(403, "forbidden");

    if (FINISHED_STATUSES.includes(call.status as any) && body.type !== "end") {
      throw new ApiError(410, "call_finished", "The call has already finished");
    }

    if (body.type === "offer" && !isInitiator) throw new ApiError(403, "forbidden", "Only the initiator sends the offer");
    if (body.type === "answer" && !isCallee) throw new ApiError(403, "forbidden", "Only the callee sends the answer");
    if (body.type === "accept" && !isCallee) throw new ApiError(403, "forbidden", "Only the callee can accept the call");

    const payload = (body.payload ?? {}) as Record<string, unknown>;
    if (JSON.stringify(payload).length > MAX_SIGNAL_PAYLOAD_LENGTH) {
      throw new ApiError(413, "payload_too_large", "Signalling payload is too large");
    }

    if (body.type === "accept") {
      const [updatedCall] = await db
        .update(calls)
        .set({ status: "active", answeredAt: new Date() })
        .where(and(eq(calls.id, id), eq(calls.status, "ringing")))
        .returning({ id: calls.id });

      if (!updatedCall) throw new ApiError(409, "call_not_ringing", "This call can no longer be accepted");
    }

    if (body.type === "end") {
      const durationMs = call.answeredAt ? Math.max(0, Date.now() - call.answeredAt.getTime()) : 0;
      await db
        .update(calls)
        .set({ status: "ended", endedAt: new Date(), durationMs, endedReason: "hangup" })
        .where(and(eq(calls.id, id), ne(calls.status, "ended")));
    }

    await db.insert(callSignals).values({
      callId: id,
      fromUserId: user.id,
      type: body.type,
      payload,
    });

    return ok({ queued: true });
  } catch (error) {
    return toResponse(error);
  }
}