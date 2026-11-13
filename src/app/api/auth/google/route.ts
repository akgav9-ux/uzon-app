import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

const STATE_COOKIE = "uzon_google_oauth_state";

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!appUrl || !clientId) {
    console.error("Google OAuth is not configured: missing app URL or client ID");
    return NextResponse.redirect(new URL("/login?error=google_not_configured", appUrl || "https://uzon-app.vercel.app"));
  }

  const accepted = requestUrl.searchParams.get("accept") === "1";
  const requestedLocale = requestUrl.searchParams.get("locale") ?? "uz";
  const locale = ["uz", "ru", "en"].includes(requestedLocale) ? requestedLocale : "uz";
  const state = randomBytes(32).toString("hex");
  const redirectUri = new URL("/api/auth/callback/google", appUrl).toString();
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(STATE_COOKIE, `${state}.${accepted ? "1" : "0"}.${locale}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
