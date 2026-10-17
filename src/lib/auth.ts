import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { privacySettings, profiles, sessions, userSettings } from "@/db/schema";
import { ApiError } from "@/lib/http";
import { parseCookies } from "@/lib/utils";

export const SESSION_COOKIE = "uzon_sid";
const SESSION_DAYS = 30;

export type ProfileRow = typeof profiles.$inferSelect;
export type SettingsRow = typeof userSettings.$inferSelect;
export type PrivacyRow = typeof privacySettings.$inferSelect;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  phoneCountry: string | null;
  avatarKey: string | null;
  coverKey: string | null;
  bio: string | null;
  links: { label: string; url: string }[];
  role: string;
  isCreator: boolean;
  showJoinedDate: boolean;
  followersCount: number;
  followingCount: number;
  createdAt: Date;
  theme: string;
  locale: string;
  autoplay: boolean;
  dataSaver: boolean;
  notifications: Record<string, boolean>;
  privacy: PrivacyRow;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password.normalize("NFKC"), salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = scryptSync(password.normalize("NFKC"), salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function cookieHeader(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

export async function createSession(userId: string, req?: Request): Promise<string> {
  const token = newToken();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: req?.headers.get("user-agent")?.slice(0, 300) ?? null,
    ip: req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  return token;
}

export async function revokeSession(token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
}

export async function revokeAllOtherSessions(userId: string, token: string): Promise<number> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(sessions.userId, userId), isNull(sessions.revokedAt), sql`${sessions.tokenHash} <> ${hashToken(token)}`),
    )
    .returning({ id: sessions.id });
  return result.length;
}

function toSessionUser(profile: ProfileRow, settings: SettingsRow | undefined, privacy: PrivacyRow): SessionUser {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    email: profile.email,
    phone: profile.phone,
    phoneCountry: profile.phoneCountry,
    avatarKey: profile.avatarKey,
    coverKey: profile.coverKey,
    bio: profile.bio,
    links: (profile.links ?? []) as { label: string; url: string }[],
    role: profile.role,
    isCreator: profile.isCreator,
    showJoinedDate: profile.showJoinedDate,
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
    createdAt: profile.createdAt,
    theme: settings?.theme ?? "system",
    locale: settings?.locale ?? "ru",
    autoplay: settings?.autoplay ?? true,
    dataSaver: settings?.dataSaver ?? false,
    notifications: (settings?.notifications ?? {}) as Record<string, boolean>,
    privacy,
  };
}

const DEFAULT_PRIVACY = {
  phoneVisibility: "nobody",
  findableByPhone: "contacts",
  whoCanMessage: "everyone",
  whoCanCall: "contacts",
  whoCanSeeStories: "everyone",
  whoCanComment: "everyone",
  whoCanTag: "contacts",
  whoCanSeeFollowing: "everyone",
  whoCanSeeActivity: "contacts",
  profileVisibility: "public",
};

export async function loadUserById(userId: string): Promise<SessionUser | null> {
  const rows = await db
    .select({ profile: profiles, settings: userSettings, privacy: privacySettings })
    .from(profiles)
    .leftJoin(userSettings, eq(userSettings.userId, profiles.id))
    .leftJoin(privacySettings, eq(privacySettings.userId, profiles.id))
    .where(and(eq(profiles.id, userId), sql`${profiles.status} <> 'deleted'`))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const privacy = (row.privacy ?? { userId, ...DEFAULT_PRIVACY }) as PrivacyRow;
  return toSessionUser(row.profile, row.settings ?? undefined, privacy);
}

export function tokenFromRequest(req: Request): string | null {
  const cookie = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  if (cookie) return cookie;
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/** Resolves the authenticated user for a request, or null when anonymous. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const rows = await db
    .select({ session: sessions })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const session = rows[0]?.session;
  if (!session) return null;
  const user = await loadUserById(session.userId);
  if (!user) return null;
  await db
    .update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, session.id))
    .catch(() => undefined);
  await db
    .update(profiles)
    .set({ lastSeenAt: new Date() })
    .where(eq(profiles.id, user.id))
    .catch(() => undefined);
  return user;
}

export async function requireUser(req: Request): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue");
  return user;
}

export async function requireStaff(req: Request): Promise<SessionUser> {
  const user = await requireUser(req);
  if (user.role !== "admin" && user.role !== "moderator") {
    throw new ApiError(403, "forbidden", "Moderator access required");
  }
  return user;
}

export async function listActiveSessions(userId: string) {
  return db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(sql`${sessions.createdAt} desc`);
}
