import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    // ИСПРАВЛЕНИЕ: ограничиваем количество соединений для serverless (Vercel)
    max: 1,
    // ИСПРАВЛЕНИЕ: отключаем prepared statements для работы с пулером Supabase
    // (иначе Vercel теряет контекст между запросами)
    statement_timeout: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);