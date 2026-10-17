import { NextResponse } from "next/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const currentUser = await requireUser(req);
    const { username } = await params;

    // Редактировать можно только свой профиль
    if (currentUser.username !== username) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const updates: { updatedAt: Date; avatarKey?: string; coverKey?: string } = { updatedAt: new Date() };

    if (typeof body.avatarKey === "string") updates.avatarKey = body.avatarKey;
    if (typeof body.coverKey === "string") updates.coverKey = body.coverKey;

    await db.update(profiles).set(updates).where(eq(profiles.id, currentUser.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PROFILE UPDATE ERROR:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}