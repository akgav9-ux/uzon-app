import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { sql } from "drizzle-orm";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

export function fail(status: number, code: string, message?: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: { code, message: message ?? code, details } }, { status });
}

/** Normalises thrown values into a JSON error response with a stable shape. */
export function toResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) return fail(error.status, error.code, error.message, error.details);
  if (error instanceof ZodError) {
    return fail(422, "validation_error", error.issues[0]?.message ?? "validation_error", error.issues);
  }
  if (error instanceof Error && /duplicate key/i.test(error.message)) {
    return fail(409, "conflict", "Resource already exists");
  }
  const message = error instanceof Error ? error.message : "internal_error";
  // Never leak internals to the client; keep the detail for server logs.
  console.error("[uzon:api]", message);
  return fail(500, "internal_error", "Something went wrong on our side");
}

export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(422, "validation_error", parsed.error.issues[0]?.message, parsed.error.issues);
  }
  return parsed.data;
}

/**
 * Fixed-window limiter persisted in Postgres so it survives restarts and works
 * across serverless instances of the same database.
 */
export async function rateLimit(key: string, limit: number, windowSeconds = 60): Promise<void> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const id = `${key}:${bucket}`;
  const rows = await db
    .insert(rateLimits)
    .values({ key: id, points: 1, windowStart: new Date() })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { points: sql`${rateLimits.points} + 1` },
    })
    .returning({ points: rateLimits.points });
  if ((rows[0]?.points ?? 1) > limit) {
    throw new ApiError(429, "rate_limited", "Too many requests, please slow down");
  }
  // Opportunistic cleanup keeps the table small.
  if (Math.random() < 0.02) {
    await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 hour'`);
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export function noStore(): ResponseInit {
  return { headers: { "Cache-Control": "no-store" } };
}
