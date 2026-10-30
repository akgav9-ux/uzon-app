import { mediaSrc } from "@/lib/media";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, profiles, privacySettings, userSettings, verificationCodes } from "@/db/schema";
import {
  cookieHeader,
  createSession,
  getSessionUser,
  loadUserById,
  hashPassword,
  hashToken,
  newToken,
  revokeSession,
  SESSION_COOKIE,
  tokenFromRequest,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth";
import { getServerConfig } from "@/lib/config";
import { ApiError, clientIp, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { authCodeEmail, authCodeSms, resetEmail, sendEmail, sendSms } from "@/lib/mailer";
import { joinOfficialChannel } from "@/db/seed";
import { loginSchema, recoverRequestSchema, recoverResetSchema, registerSchema } from "@/lib/validation";
import { normalizeUsername } from "@/lib/validation";
export { SESSION_COOKIE };
import { randomInt } from "node:crypto";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SESSION_SECONDS = 30 * 86_400;

function serializeUser(user: SessionUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    avatarKey: user.avatarKey,
    avatarUrl: mediaSrc({ key: user.avatarKey ?? "" }),
    coverKey: user.coverKey,
    bio: user.bio,
    links: user.links,
    role: user.role,
    isCreator: user.isCreator,
    showJoinedDate: user.showJoinedDate,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    createdAt: user.createdAt.toISOString(),
    theme: user.theme,
    locale: user.locale,
    autoplay: user.autoplay,
    dataSaver: user.dataSaver,
    notifications: user.notifications,
    privacy: user.privacy,
  };
}

export async function GET(req: Request) {
  try {
    const token = tokenFromRequest(req);
    if (!token) return ok({ user: null });
    const user = await getSessionUser(req);
    return ok({ user: user ? serializeUser(user) : null });
  } catch (error) {
    return toResponse(error);
  }
}

const postSchema = z.discriminatedUnion("action", [
  registerSchema.extend({ action: z.literal("register") }),
  loginSchema.extend({ action: z.literal("login") }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("resend"), channel: z.enum(["email", "phone"]).optional() }),
  z.object({ action: z.literal("verify"), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }),
  recoverRequestSchema.extend({ action: z.literal("recover") }),
  recoverResetSchema.extend({ action: z.literal("reset") }),
  // Новые action для входа по коду
  z.object({ action: z.literal("request_code"), email: z.string().email() }),
  z.object({ action: z.literal("login_code"), email: z.string().email(), code: z.string().regex(/^\d{6}$/) }),
]);

async function issueCode(userId: string, channel: "email" | "phone", destination: string, locale: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(verificationCodes).values({
    userId,
    channel,
    destination,
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  const delivery =
    channel === "email" ? await sendEmail(destination, authCodeEmail(code, locale).subject, authCodeEmail(code, locale).html) : await sendSms(destination, authCodeSms(code));
  return { code, delivery };
}

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const config = await getServerConfig();
    const body = await readBody(req, postSchema);

    switch (body.action) {
      case "register": {
        await rateLimit(`register:${ip}`, 6, 3600);
        const username = normalizeUsername(body.username);
        const email = body.email ? body.email.toLowerCase().trim() : null;
        const phone = body.phone ? body.phone.replace(/[^\d+]/g, "") : null;

        const clash = await db
          .select({ id: profiles.id })
          .from(profiles)
          .where(or(eq(profiles.username, username), email ? eq(profiles.email, email) : sql`false`, phone ? eq(profiles.phone, phone) : sql`false`))
          .limit(1);
        if (clash[0]) throw new ApiError(409, "identifier_taken", "That username, email or phone is already registered");

        const locale = body.locale ?? "ru";
        const [created] = await db
          .insert(profiles)
          .values({
            username,
            displayName: body.displayName.trim(),
            email,
            phone,
            phoneCountry: body.phoneCountry ?? (phone?.startsWith("+998") ? "+998" : null),
            passwordHash: hashPassword(body.password),
            emailVerified: false,
            phoneVerified: false,
          })
          .returning({ id: profiles.id });
        const userId = created!.id;
        await db.insert(userSettings).values({ userId, locale, theme: body.theme ?? "system" });
        await db.insert(privacySettings).values({ userId });
        await joinOfficialChannel(userId).catch(() => undefined);

        const channel: "email" | "phone" = email ? "email" : "phone";
        const destination = email ?? phone!;
        const { code, delivery } = await issueCode(userId, channel, destination, locale);
        const token = await createSession(userId, req);
        const loaded = await loadUserById(userId);
        if (!loaded) throw new ApiError(500, "session_error", "Could not load the new account");
        return ok(
          {
            user: serializeUser(loaded),
            verification: {
              channel,
              destination: channel === "email" ? destination.replace(/(^..).*(@)/, "$1***$2") : `${destination.slice(0, 4)}***${destination.slice(-2)}`,
              delivered: delivery.delivered,
              deliveryReason: delivery.reason ?? null,
              // Only ever exposed when no real provider is configured AND demo mode is on.
              devCode: !delivery.delivered && config.demoMode ? code : null,
            },
          },
          { headers: { "Set-Cookie": cookieHeader(token, SESSION_SECONDS) } },
        );
      }

      case "login": {
        await rateLimit(`login:${ip}`, 20, 900);
        const identifier = body.identifier.trim().toLowerCase();
        const [row] = await db
          .select()
          .from(profiles)
          .where(
            or(
              eq(profiles.username, identifier.replace(/^@/, "")),
              eq(profiles.email, identifier),
              eq(profiles.phone, identifier),
              eq(profiles.phone, identifier.replace(/[^\d+]/g, "")),
            ),
          )
          .limit(1);
        if (!row || !row.passwordHash || !verifyPassword(body.password, row.passwordHash)) {
          throw new ApiError(401, "invalid_credentials", "Incorrect username/email or password");
        }
        if (row.status === "suspended") throw new ApiError(403, "suspended", "This account is suspended");
        if (row.status === "deleted") throw new ApiError(410, "deleted", "This account has been deleted");
        const token = await createSession(row.id, req);
        const user = await loadUserById(row.id);
        return ok(
          { user: serializeUser(user!) },
          { headers: { "Set-Cookie": cookieHeader(token, SESSION_SECONDS) } },
        );
      }

      case "logout": {
        const token = tokenFromRequest(req);
        if (token) await revokeSession(token);
        return ok({ ok: true }, { headers: { "Set-Cookie": cookieHeader("", 0) } });
      }

      case "resend": {
        const user = await getSessionUser(req);
        if (!user) throw new ApiError(401, "unauthenticated");
        await rateLimit(`resend:${user.id}`, 5, 600);
        const channel = body.channel ?? (user.email ? "email" : "phone");
        const destination = channel === "email" ? user.email : user.phone;
        if (!destination) throw new ApiError(422, "no_destination", "Add an email or phone number first");
        const { code, delivery } = await issueCode(user.id, channel, destination, user.locale);
        return ok({ delivered: delivery.delivered, reason: delivery.reason ?? null, devCode: !delivery.delivered && config.demoMode ? code : null });
      }

      case "verify": {
        const user = await getSessionUser(req);
        if (!user) throw new ApiError(401, "unauthenticated");
        await rateLimit(`verify:${user.id}`, 10, 600);
        const [record] = await db
          .select()
          .from(verificationCodes)
          .where(
            and(
              eq(verificationCodes.userId, user.id),
              sql`${verificationCodes.usedAt} is null`,
              sql`${verificationCodes.expiresAt} > now()`,
            ),
          )
          .orderBy(sql`${verificationCodes.createdAt} desc`)
          .limit(1);
        if (!record) throw new ApiError(410, "code_expired", "The code has expired, request a new one");
        if (record.attempts >= 5) throw new ApiError(429, "too_many_attempts", "Too many attempts, request a new code");
        if (record.codeHash !== hashToken(body.code)) {
          await db.update(verificationCodes).set({ attempts: record.attempts + 1 }).where(eq(verificationCodes.id, record.id));
          throw new ApiError(422, "invalid_code", "The code is incorrect");
        }
        await db.update(verificationCodes).set({ usedAt: new Date() }).where(eq(verificationCodes.id, record.id));
        await db
          .update(profiles)
          .set(record.channel === "email" ? { emailVerified: true } : { phoneVerified: true })
          .where(eq(profiles.id, user.id));
        return ok({ verified: true, channel: record.channel });
      }

      // Новый action: отправка кода для входа по email
      case "request_code": {
        await rateLimit(`request-code:${ip}`, 5, 600);
        const email = body.email.toLowerCase().trim();
        const [row] = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
        if (!row) return ok({ sent: true }); // не раскрываем существование аккаунта
        const locale = (await db.select({ locale: userSettings.locale }).from(userSettings).where(eq(userSettings.userId, row.id)).limit(1))[0]?.locale ?? "ru";
        const { code, delivery } = await issueCode(row.id, "email", email, locale);
        return ok({ sent: true, delivered: delivery.delivered, reason: delivery.reason ?? null, devCode: !delivery.delivered && config.demoMode ? code : null });
      }

      // Новый action: вход по коду из email
      case "login_code": {
        await rateLimit(`login-code:${ip}`, 10, 600);
        const email = body.email.toLowerCase().trim();
        const [row] = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
        if (!row) throw new ApiError(401, "invalid_code", "Incorrect email or code");
        const [record] = await db
          .select()
          .from(verificationCodes)
          .where(and(eq(verificationCodes.userId, row.id), eq(verificationCodes.channel, "email"), sql`${verificationCodes.usedAt} is null`, sql`${verificationCodes.expiresAt} > now()`))
          .orderBy(sql`${verificationCodes.createdAt} desc`)
          .limit(1);
        if (!record) throw new ApiError(410, "code_expired", "The code has expired, request a new one");
        if (record.attempts >= 5) throw new ApiError(429, "too_many_attempts", "Too many attempts");
        if (record.codeHash !== hashToken(body.code)) {
          await db.update(verificationCodes).set({ attempts: record.attempts + 1 }).where(eq(verificationCodes.id, record.id));
          throw new ApiError(422, "invalid_code", "The code is incorrect");
        }
        await db.update(verificationCodes).set({ usedAt: new Date() }).where(eq(verificationCodes.id, record.id));
        await db.update(profiles).set({ emailVerified: true }).where(eq(profiles.id, row.id));
        const token = await createSession(row.id, req);
        const user = await loadUserById(row.id);
        return ok({ user: serializeUser(user!) }, { headers: { "Set-Cookie": cookieHeader(token, SESSION_SECONDS) } });
      }

      case "recover": {
        await rateLimit(`recover:${ip}`, 5, 900);
        const identifier = body.identifier.trim().toLowerCase();
        const [row] = await db
          .select()
          .from(profiles)
          .where(or(eq(profiles.username, identifier.replace(/^@/, "")), eq(profiles.email, identifier), eq(profiles.phone, identifier)))
          .limit(1);
        // Always answer 200 so account existence is not disclosed.
        if (!row) return ok({ sent: true, devLink: null, reason: "unknown_account" });
        const token = newToken();
        await db.insert(passwordResets).values({
          userId: row.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60_000),
        });
        const origin = req.headers.get("origin") ?? req.headers.get("host") ?? "http://localhost:3000";
        const link = `${origin.replace(/\/$/, "")}/recover?token=${token}`;
        const locale = (await db.select({ locale: userSettings.locale }).from(userSettings).where(eq(userSettings.userId, row.id)).limit(1))[0]?.locale ?? "ru";
        const delivery = row.email
          ? await sendEmail(row.email, resetEmail(link, locale).subject, resetEmail(link, locale).html)
          : await sendSms(row.phone ?? "", link);
        return ok({
          sent: true,
          delivered: delivery.delivered,
          reason: delivery.reason ?? null,
          devLink: !delivery.delivered && config.demoMode ? link : null,
        });
      }

      case "reset": {
        await rateLimit(`reset:${ip}`, 10, 900);
        const [record] = await db
          .select()
          .from(passwordResets)
          .where(and(eq(passwordResets.tokenHash, hashToken(body.token)), sql`${passwordResets.usedAt} is null`, sql`${passwordResets.expiresAt} > now()`))
          .limit(1);
        if (!record) throw new ApiError(410, "token_invalid", "The reset link is invalid or expired");
        await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, record.id));
        await db.update(profiles).set({ passwordHash: hashPassword(body.password), updatedAt: new Date() }).where(eq(profiles.id, record.userId));
        await db
          .update(verificationCodes)
          .set({ usedAt: new Date() })
          .where(and(eq(verificationCodes.userId, record.userId), sql`${verificationCodes.usedAt} is null`));
        return ok({ reset: true });
      }
    }
  } catch (error) {
    return toResponse(error);
  }
}

export const runtime = "nodejs";