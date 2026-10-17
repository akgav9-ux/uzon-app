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

    // Если токена нет — выводим ответ Google в консоль и показываем ошибку
    if (!access_token) {
      console.error("GOOGLE TOKEN ERROR:", tokenData);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=no_access_token`);
    }

    // 2. Получаем данные пользователя
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const googleUser = await userRes.json();

    // 3. Защита: если Google не вернул email или id
    if (!googleUser?.email || !googleUser?.id) {
      console.error("GOOGLE USER MISSING DATA:", googleUser);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=google_no_email`);
    }

    // 4. Ищем пользователя по googleId, затем по email
    let [user] = await db.select().from(profiles).where(eq(profiles.googleId, googleUser.id)).limit(1);

    if (!user) {
      [user] = await db.select().from(profiles).where(eq(profiles.email, googleUser.email)).limit(1);
      if (user) {
        // Привязываем Google ID к существующему аккаунту
        await db.update(profiles).set({ googleId: googleUser.id }).where(eq(profiles.id, user.id));
      } else {
        // Создаём нового пользователя
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

    // 5. Создаём сессию и редиректим на главную
    const token = await createSession(user.id, req);
    const res = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/home?auth=success`);
    res.headers.set("Set-Cookie", cookieHeader(token, 30 * 24 * 60 * 60));
    return res;

  } catch (error) {
    console.error("GOOGLE AUTH ERROR:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=${encodeURIComponent(message)}`);
  }
}