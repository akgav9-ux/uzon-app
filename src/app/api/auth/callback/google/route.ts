import { NextResponse } from "next/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, cookieHeader } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=no_code`);

  try {
    // 1. Меняем код на access_token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;

    if (!access_token) {
      console.error("GOOGLE TOKEN ERROR:", tokenData);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=no_access_token`);
    }

    // 2. Получаем данные пользователя
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const googleUser = await userRes.json();

    if (!googleUser?.email || !googleUser?.id) {
      console.error("GOOGLE USER MISSING DATA:", googleUser);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=google_no_email`);
    }

    // 3. Ищем или создаём пользователя
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

    // 4. Создаём сессию
    const token = await createSession(user.id, req);

    // 5. Возвращаем HTML-страницу, которая установит куки и перекинет на /home
    // (обычный redirect иногда не успевает установить куки в браузере)
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Вход...</title>
          <meta http-equiv="refresh" content="0; url=${process.env.NEXT_PUBLIC_APP_URL}/home?auth=success" />
        </head>
        <body>
          <p>Входим... <a href="${process.env.NEXT_PUBLIC_APP_URL}/home?auth=success">Нажмите, если не перенаправило</a></p>
          <script>window.location.href = "${process.env.NEXT_PUBLIC_APP_URL}/home?auth=success";</script>
        </body>
      </html>
    `;

    const res = new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": cookieHeader(token, 30 * 24 * 60 * 60),
      },
    });

    return res;

  } catch (error) {
    console.error("GOOGLE AUTH ERROR:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=${encodeURIComponent(message)}`);
  }
}