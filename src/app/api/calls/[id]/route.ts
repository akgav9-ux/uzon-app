
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { calls, callSignals } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, readBody, toResponse } from "@/lib/http";
import { notify } from "@/lib/services";

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

    const isInitiator = call.initiatorId === user.id;
    const isCallee = call.calleeId === user.id;

    if (!isInitiator && !isCallee) {
      throw new ApiError(403, "forbidden", "You are not a participant in this call");
    }

    return ok({
      call: {
        id: call.id,
        kind: call.kind,
        status: call.status,
        initiatorId: call.initiatorId,
        calleeId: call.calleeId,
        conversationId: call.conversationId,
        isInitiator,
        answeredAt: call.answeredAt?.toISOString() ?? null,
        createdAt: call.createdAt.toISOString(),
        endedAt: call.endedAt?.toISOString() ?? null,
        durationMs: call.durationMs,
        endedReason: call.endedReason,
      },
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const body = await readBody(
  req,
  z.object({
    action: z.enum(["accept", "decline", "end"]),
  }),
);

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

    if (body.action === "accept") {
      if (!isCallee) {
        throw new ApiError(403, "forbidden", "Only the recipient can accept this call");
      }

      const [updatedCall] = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(calls)
          .set({
            status: "active",
            answeredAt: new Date(),
          })
          .where(
            and(
              eq(calls.id, id),
              eq(calls.status, "ringing"),
            ),
          )
          .returning();

        if (!updated) {
          throw new ApiError(
            409,
            "call_not_ringing",
            "This call can no longer be accepted",
          );
        }

        await tx.insert(callSignals).values({
          callId: id,
          fromUserId: user.id,
          type: "accept",
          payload: {},
        });

        return [updated];
      });

      return ok({
        call: {
          id: updatedCall.id,
          status: updatedCall.status,
          answeredAt: updatedCall.answeredAt?.toISOString() ?? null,
        },
      });
    }

    if (body.action === "decline") {
      if (!isCallee) {
        throw new ApiError(403, "forbidden", "Only the recipient can decline this call");
      }

      if (call.status !== "ringing") {
        throw new ApiError(409, "call_not_ringing", "This call is no longer ringing");
      }

      await db.transaction(async (tx) => {
        await tx
          .update(calls)
          .set({
            status: "declined",
            endedAt: new Date(),
            endedReason: "declined",
          })
          .where(
            and(
              eq(calls.id, id),
              eq(calls.status, "ringing"),
            ),
          );

        await tx.insert(callSignals).values({
          callId: id,
          fromUserId: user.id,
          type: "decline",
          payload: {},
        });
      });

      await notify({
        userId: call.initiatorId,
        type: "call",
        actorId: user.id,
        entityType: "call",
        entityId: id,
        preview: "declined",
        category: "calls",
      });

      return ok({ status: "declined" });
    }

    if (body.action === "end") {
      if ((FINISHED_STATUSES as readonly string[]).includes(call.status)) {
        return ok({ status: call.status });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(calls)
          .set({
            status: "ended",
            endedAt: new Date(),
            endedReason: "ended",
          })
          .where(eq(calls.id, id));

        await tx.insert(callSignals).values({
          callId: id,
          fromUserId: user.id,
          type: "end",
          payload: {},
        });
      });

      return ok({ status: "ended" });
    }

    throw new ApiError(400, "invalid_action", "Unsupported call action");
  } catch (error) {
    return toResponse(error);
  }
}
