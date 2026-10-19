#!/usr/bin/env node
/**
 * Operator tool: grant or revoke a moderation role.
 *
 *   node scripts/grant-admin.mjs <username> [moderator|admin|user]
 *
 * Roles are never self-assignable through the API. This script requires direct
 * database access (DATABASE_URL), which is the intended trust boundary.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env file */
  }
}

loadEnv();

const username = process.argv[2];
const role = process.argv[3] ?? "admin";

if (!username || !["admin", "moderator", "user"].includes(role)) {
  console.error("Usage: node scripts/grant-admin.mjs <username> [moderator|admin|user]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query("update profiles set role = $1, updated_at = now() where lower(username) = lower($2) returning id, username, role", [
    role,
    username,
  ]);
  if (result.rowCount === 0) {
    console.error(`No profile found for @${username}`);
    process.exit(2);
  }
  const row = result.rows[0];
  await client.query(
    "insert into moderation_actions (moderator_id, action, entity_type, entity_id, note) values ($1, 'grant_role', 'user', $2, $3)",
    [row.id, row.id, `role set to ${row.role} via CLI`],
  );
  console.log(`@${row.username} now has role "${row.role}"`);
} finally {
  await client.end();
}
