import { requireUser } from "@/lib/auth";
import { getMeteredIceServers } from "@/lib/metered-turn";
import { ApiError, ok, rateLimit, toResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    await rateLimit(`turn-ice:${user.id}`, 30, 60);

    const iceServers = await getMeteredIceServers();

    return ok(
      { iceServers },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message;

      if (
        message.includes("TURN credentials have not been initialized") ||
        message.includes("Metered ICE lookup failed") ||
        message.includes("Metered returned")
      ) {
        return toResponse(
          new ApiError(
            503,
            "turn_unavailable",
            "Сервис звонков временно недоступен. Попробуйте позже.",
          ),
        );
      }
    }

    return toResponse(error);
  }
}