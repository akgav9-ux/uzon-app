import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { media, posts, privacySettings, profiles, sessions, stories, userSettings, videos } from "@/db/schema";
import { hashPassword, listActiveSessions, loadUserById, requireUser, revokeAllOtherSessions, tokenFromRequest, verifyPassword } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse, clientIp } from "@/lib/http";
import { deleteMedia } from "@/lib/storage";
import { profileUpdateSchema, privacyUpdateSchema, settingsUpdateSchema } from "@/lib/validation";
import { normalizeUsername } from "@/lib/validation";
import { hashToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.discriminatedUnion("scope", [
  profileUpdateSchema.extend({ scope: z.literal("profile") }),
  settingsUpdateSchema.extend({ scope: z.literal("settings") }),
  privacyUpdateSchema.extend({ scope: z.literal("privacy") }),
]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("changePassword"), currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) }),
  z.object({ action: z.literal("revokeSession"), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("revokeOthers") }),
  z.object({ action: z.literal("deleteAccount"), confirm: z.string().min(1), password: z.string().min(1) }),
]);

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const [profile] = await db
      .select({ emailVerified: profiles.emailVerified, phoneVerified: profiles.phoneVerified, status: profiles.status })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    const activeSessions = await listActiveSessions(user.id);
    const currentHash = tokenFromRequest(req) ? hashToken(tokenFromRequest(req)!) : null;
    return ok({
      profile,
      sessions: activeSessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
      currentSessionId: currentHash,
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`account:${user.id}`, 60, 60);
    const body = await readBody(req, patchSchema);

    if (body.scope === "profile") {
      const { scope: _scope, ...fields } = body;
      void _scope;
      if (fields.username) {
        const next = normalizeUsername(fields.username);
        const clash = await db
          .select({ id: profiles.id })
          .from(profiles)
          .where(and(eq(profiles.username, next), sql`${profiles.id} <> ${user.id}`))
          .limit(1);
        if (clash[0]) throw new ApiError(409, "username_taken", "That username is already taken");
        fields.username = next;
      }
      await db.update(profiles).set({ ...fields, updatedAt: new Date() }).where(eq(profiles.id, user.id));
    } else if (body.scope === "settings") {
      const { scope: _scope, ...fields } = body;
      void _scope;
      await db
        .update(userSettings)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(userSettings.userId, user.id));
    } else {
      const { scope: _scope, ...fields } = body;
      void _scope;
      const existing = await db.select().from(privacySettings).where(eq(privacySettings.userId, user.id)).limit(1);
      if (existing[0]) {
        await db.update(privacySettings).set({ ...fields, updatedAt: new Date() }).where(eq(privacySettings.userId, user.id));
      } else {
        await db.insert(privacySettings).values({ userId: user.id, ...fields });
      }
    }

    const fresh = await loadUserById(user.id);
    return ok({ user: fresh ? { theme: fresh.theme, locale: fresh.locale, privacy: fresh.privacy, bio: fresh.bio } : null });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await readBody(req, actionSchema);

    if (body.action === "changePassword") {
      await rateLimit(`pw:${user.id}`, 5, 900);
      const [row] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
      if (!row || !row.passwordHash || !verifyPassword(body.currentPassword, row.passwordHash)) {
        throw new ApiError(401, "invalid_password", "Current password is incorrect");
      }
      await db.update(profiles).set({ passwordHash: hashPassword(body.newPassword), updatedAt: new Date() }).where(eq(profiles.id, user.id));
      const token = tokenFromRequest(req)!;
      const revoked = await revokeAllOtherSessions(user.id, token);
      return ok({ changed: true, revokedSessions: revoked });
    }

    if (body.action === "revokeSession") {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.id, body.sessionId), eq(sessions.userId, user.id)));
      return ok({ revoked: true });
    }

    if (body.action === "revokeOthers") {
      const revoked = await revokeAllOtherSessions(user.id, tokenFromRequest(req) ?? "");
      return ok({ revokedSessions: revoked });
    }

    // deleteAccount — irreversible, requires explicit confirmation + password.
    await rateLimit(`delete:${user.id}`, 3, 3600);
    if (body.confirm !== "DELETE") throw new ApiError(422, "confirm_required", 'Type DELETE to confirm');
    const [row] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
    // ИСПРАВЛЕНИЕ: добавлена проверка !row.passwordHash (у Google-пользователей пароля может не быть)
    if (!row || !row.passwordHash || !verifyPassword(body.password, row.passwordHash)) {
      throw new ApiError(401, "invalid_password", "Password is incorrect");
    }
    const ownedMedia = await db.select({ key: media.key }).from(media).where(eq(media.ownerId, user.id));
    await db.update(profiles).set({ status: "deleted", email: null, phone: null, displayName: "Deleted account", bio: null }).where(eq(profiles.id, user.id));
    await db.update(posts).set({ deletedAt: new Date(), text: null }).where(eq(posts.authorId, user.id));
    await db.update(videos).set({ deletedAt: new Date() }).where(eq(videos.ownerId, user.id));
    await db.update(stories).set({ deletedAt: new Date() }).where(eq(stories.userId, user.id));
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    // Media files are removed after the database rows so nothing is orphaned.
    for (const m of ownedMedia.slice(0, 500)) await deleteMedia(m.key);
    return ok({ deleted: true }, { headers: { "Set-Cookie": `${"uzon_sid"}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` } });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`delete:${clientIp(req)}`, 3, 3600);
    await db.update(profiles).set({ status: "deleted" }).where(eq(profiles.id, user.id));
    return ok({ deleted: true });
  } catch (error) {
    return toResponse(error);
  }
}