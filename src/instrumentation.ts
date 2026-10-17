/**
 * Boots the demo dataset on first start (when the profiles table is empty) so
 * the application is usable immediately. Disable with SEED_ON_BOOT=false.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    // Load database/Node-only modules only in the Node.js runtime. A top-level
    // import would also pull node:crypto into the Edge instrumentation bundle.
    const { seedIfEmpty } = await import("@/db/seed");
    const result = await seedIfEmpty();
    if (result.seeded) console.log("[uzon] demo dataset seeded");
    else if (result.reason && result.reason !== "already-seeded") console.log(`[uzon] seed skipped: ${result.reason}`);
  } catch (error) {
    console.error("[uzon] seed skipped:", error instanceof Error ? error.message : error);
  }
}
