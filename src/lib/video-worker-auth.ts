import { timingSafeEqual } from "node:crypto";

export function assertVideoWorker(req: Request) {
  const expected = process.env.VIDEO_WORKER_TOKEN;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
