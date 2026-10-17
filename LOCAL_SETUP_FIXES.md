# UZON local setup notes

## 1. Configure PostgreSQL

Create a local PostgreSQL database named `app_db`, then copy `.env.example` to `.env` and set `DATABASE_URL` to the real local credentials. Do not commit `.env`.

## 2. Install dependencies and create tables

```powershell
npm install
npx drizzle-kit push --config=drizzle.config.ts
```

The Drizzle config now reads `DATABASE_URL` from `.env` instead of silently using the hard-coded `postgres:postgres` connection from the old JSON config.

## 3. Start Next.js

```powershell
npm run dev
```

## Changes made for this troubleshooting pass

- `src/instrumentation.ts` dynamically imports the seeder only inside the Node.js runtime, avoiding a top-level import chain that pulls `node:crypto` into Edge instrumentation.
- Replaced `drizzle.config.json` with `drizzle.config.ts`, which reads `DATABASE_URL` from `.env`.
- Added `.env.example` and this setup note.

These changes do not prove the app builds or the database connects; run the commands above and inspect the actual output. If `drizzle-kit push` fails, resolve that database connection/schema error before trying registration again.
