import { NextResponse } from "next/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, SESSION_COOKIE } from "@/lib/auth";

const STATE_COOKIE = "uzon_google_oauth_state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookieState = req.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  const clearStateCookie = () => ({
    name: STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  });

  if (!returnedState || !cookieState || returnedState !== cookieState) {
    const response = NextResponse.redirect(new URL("/login?error=google_state_mismatch", appUrl));
    response.cookies.set(clearStateCookie());
    return response;
  }

  if (!code) {
    const response = NextResponse.redirect(new URL("/login?error=no_code", appUrl));
    response.cookies.set(clearStateCookie());
    return response;
  }

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
      const response = NextResponse.redirect(new URL("/login?error=no_access_token", appUrl));
      response.cookies.set(clearStateCookie());
      return response;
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const googleUser = await userRes.json();

    if (!googleUser?.email || !googleUser?.id) {
      console.error("GOOGLE USER MISSING DATA:", googleUser);
      const response = NextResponse.redirect(new URL("/login?error=google_no_email", appUrl));
      response.cookies.set(clearStateCookie());
      return response;
    }

    let [user] = await db.select().from(profiles).where(eq(profiles.googleId, googleUser.id)).limit(1);

    if (!user) {
      [user] = await db.select().from(profiles).where(eq(profiles.email, googleUser.email)).limit(1);
      if (user) {
        await db.update(profiles).set({ googleId: googleUser.id }).where(eq(profiles.id, user.id));
      } else {
        const baseUsername = googleUser.email.split("@")[0].replace(/[^a-z0-9_.]/g, "") || "user";
        const username = `${baseUsername}${Math.floor(Math.random() * 10000)}`;
        [user] = await db.insert(profiles).values({
          username,
          displayName: googleUser.name || googleUser.email,
          email: googleUser.email,
          googleId: googleUser.id,
          emailVerified: true,
        }).returning();
      }
    }

    if (!user || user.status !== "active") {
      const response = NextResponse.redirect(new URL("/login?error=account_unavailable", appUrl));
      response.cookies.set(clearStateCookie());
      return response;
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
    const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, appUrl));
    response.cookies.set(clearStateCookie());
    return response;
  }
}
