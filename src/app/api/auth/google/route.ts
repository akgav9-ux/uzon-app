import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accepted = url.searchParams.get("accept") === "1";
  const requestedLocale = url.searchParams.get("locale") ?? "uz";
  const locale = ["uz", "ru", "en"].includes(requestedLocale) ? requestedLocale : "uz";
  const state = randomBytes(24).toString("hex");
  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const options = {
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    access_type: "offline",
    response_type: "code",
    prompt: "consent",
    state,
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  };
  const response = NextResponse.redirect(`${rootUrl}?${new URLSearchParams(options).toString()}`);
  response.cookies.set("uzon_google_flow", `${state}.${accepted ? "1" : "0"}.${locale}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
