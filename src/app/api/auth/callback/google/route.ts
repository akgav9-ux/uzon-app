import { NextResponse } from "next/server";
import { db } from "@/db";
import { profiles, legalAcceptances, userSettings, privacySettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, SESSION_COOKIE } from "@/lib/auth";

const STATE_COOKIE = "uzon_google_oauth_state";

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const returnedState = requestUrl.searchParams.get("state");
  const cookieValue = req.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  const [cookieState, acceptedFlag, requestedLocale] = decodeURIComponent(cookieValue ?? "").split(".");
  const locale = ["uz-Latn", "ru", "en"].includes(requestedLocale) ? requestedLocale : "uz";

  const clearStateCookie = () => ({
    name: STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  });

  const redirectWithError = (path: string) => {
    const response = NextResponse.redirect(new URL(path, appUrl));
    response.cookies.set(clearStateCookie());
    return response;
  };

  if (!returnedState || !cookieState || returnedState !== cookieState) {
    return redirectWithError("/login?error=google_state_mismatch");
  }

  if (!code) return redirectWithError("/login?error=no_code");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: new URL("/api/auth/callback/google", appUrl).toString(),
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("GOOGLE TOKEN ERROR:", tokenData);
      return redirectWithError("/login?error=no_access_token");
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const googleUser = await userRes.json();

    if (!googleUser?.email || !googleUser?.id) {
      console.error("GOOGLE USER MISSING DATA:", googleUser);
      return redirectWithError("/login?error=google_no_email");
    }

    if (googleUser.verified_email !== true) {
      return redirectWithError("/login?error=google_email_unverified");
    }

    let createdNewUser = false;
    let [user] = await db.select().from(profiles).where(eq(profiles.googleId, googleUser.id)).limit(1);

    if (!user) {
      [user] = await db.select().from(profiles).where(eq(profiles.email, googleUser.email)).limit(1);
      if (user) {
        await db.update(profiles).set({ googleId: googleUser.id }).where(eq(profiles.id, user.id));
      } else {
        if (acceptedFlag !== "1") {
          return redirectWithError("/register?error=terms_required");
        }

        const baseUsername = googleUser.email.split("@")[0].replace(/[^a-z0-9_.]/g, "") || "user";
        const username = `${baseUsername}${Math.floor(Math.random() * 10000)}`;
        [user] = await db.transaction(async (tx) => {
          const [created] = await tx.insert(profiles).values({
            username,
            displayName: googleUser.name || googleUser.email,
            email: googleUser.email,
            googleId: googleUser.id,
            emailVerified: true,
          }).returning();

          await tx.insert(legalAcceptances).values({
            userId: created.id,
            documentVersion: "2026-11-12",
            locale,
            ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
            userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
          });
          await tx.insert(userSettings).values({ userId: created.id, locale, theme: "system" });
          await tx.insert(privacySettings).values({ userId: created.id });
          return [created];
        });
        createdNewUser = true;
      }
    }

    if (!user || user.status !== "active") {
      return redirectWithError("/login?error=account_unavailable");
    }

    // Record consent only when the user explicitly accepted it on the registration screen.
    if (acceptedFlag === "1" && !createdNewUser) {
      await db.insert(legalAcceptances).values({
        userId: user.id,
        documentVersion: "2026-11-12",
        locale,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      });
    }

    if (googleUser.verified_email === true && !user.emailVerified) {
      await db.update(profiles).set({ emailVerified: true }).where(eq(profiles.id, user.id));
    }

    const token = await createSession(user.id, req);
    const response = NextResponse.redirect(new URL("/home?auth=success", appUrl));
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    response.cookies.set(clearStateCookie());
    return response;
  } catch (error) {
    console.error("GOOGLE AUTH ERROR:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return redirectWithError(`/login?error=${encodeURIComponent(message)}`);
  }
}
