import { requireStaff } from "@/lib/auth";
import { ok, toResponse } from "@/lib/http";
import {
  createMeteredCredential,
  getStoredMeteredCredential,
  getMeteredCredentialAgeHours,
} from "@/lib/metered-turn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authorization = req.headers.get("authorization");

    const cronAuthorized = Boolean(
      cronSecret && authorization === `Bearer ${cronSecret}`,
    );

    if (!cronAuthorized) {
      await requireStaff(req);
    }

    const current = await getStoredMeteredCredential();

    if (
      current &&
      getMeteredCredentialAgeHours(current.createdAt) < 20
    ) {
      return ok({
        ok: true,
        rotated: false,
        message: "Текущий TURN-ключ ещё действителен.",
      });
    }

    const credential = await createMeteredCredential();

    return ok({
      ok: true,
      rotated: true,
      createdAt: credential.createdAt,
    });
  } catch (error) {
    return toResponse(error);
  }
}