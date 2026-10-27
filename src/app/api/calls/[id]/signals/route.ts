
import { and, asc, eq, isNull, ne, inArray } from "drizzle-orm";
import { db } from "@/db";
import { calls, callSignals } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { callSignalSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const FINISHED_STATUSES = [
  "ended",
  "declined",
  "missed",
  "failed",
] as const;

export async function GET(req: Request, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;

    const [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.id, id))
      .limit(1);

    if (!call) {
      throw new ApiError(404, "call_not_found", "Call not found");
    }

    if (call.initiatorId !== user.id && call.calleeId !== user.id) {
      throw new ApiError(403, "forbidden", "You are not a participant in this call");
    }

    let status = call.status;

    if (
      status === "ringing" &&
      Date.now() - call.createdAt.getTime() > 90_000
    ) {
      await db
        .update(calls)
        .set({
          status: "missed",
          endedAt: new Date(),
          endedReason: "timeout",
        })
        .where(
          and(
            eq(calls.id, id),
            eq(calls.status, "ringing"),
          ),
        );

      const [updatedCall] = await db
        .select({ status: calls.status })
        .from(calls)
        .where(eq(calls.id, id))
        .limit(1);

      status = updatedCall?.status ?? "missed";
    }

    const signals = await db
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
      .limit(50);

    if (signals.length > 0) {
      await db
        .update(callSignals)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(callSignals.callId, id),
            inArray(
              callSignals.id,
              signals.map((signal) => signal.id),
            ),
            isNull(callSignals.consumedAt),
          ),
        );
    }

    return ok({
      status,
      signals: signals.map((signal) => ({
        id: signal.id,
        type: signal.type,
        payload: signal.payload,
        createdAt: signal.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const body = await readBody(req, callSignalSchema);

    await rateLimit(`call-signal:${user.id}`, 180, 60);

    const [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.id, id))
      .limit(1);

    if (!call) {
      throw new ApiError(404, "call_not_found", "Call not found");
    }

    const isInitiator = call.initiatorId === user.id;
    const isCallee = call.calleeId === user.id;

    if (!isInitiator && !isCallee) {
      throw new ApiError(403, "forbidden", "You are not a participant in this call");
    }

    if (
      (FINISHED_STATUSES as readonly string[]).includes(call.status) &&
      body.type !== "end"
    ) {
      throw new ApiError(410, "call_finished", "This call has already ended");
    }

    if (body.type === "offer" && !isInitiator) {
      throw new ApiError(403, "forbidden", "Only the caller can send an offer");
    }

    if (body.type === "answer" && !isCallee) {
      throw new ApiError(403, "forbidden", "Only the recipient can send an answer");
    }

    if (body.type === "accept" && !isCallee) {
      throw new ApiError(403, "forbidden", "Only the recipient can accept this call");
    }

    if (
      body.payload &&
      JSON.stringify(body.payload).length > 100_000
    ) {
      throw new ApiError(413, "payload_too_large", "Call signal payload is too large");
    }

    if (body.type === "end") {
      await db
        .update(calls)
        .set({
          status: "ended",
          endedAt: new Date(),
          endedReason: "ended",
        })
        .where(
          and(
            eq(calls.id, id),
            ne(calls.status, "ended"),
            ne(calls.status, "declined"),
            ne(calls.status, "missed"),
            ne(calls.status, "failed"),
          ),
        );
    }

    await db.insert(callSignals).values({
      callId: id,
      fromUserId: user.id,
      type: body.type,
      payload: body.payload ?? {},
    });

    return ok({ queued: true });
  } catch (error) {
    return toResponse(error);
  }
}
