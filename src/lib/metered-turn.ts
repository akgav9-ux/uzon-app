
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appConfig } from "@/db/schema";

const TURN_CONFIG_KEY = "meteredTurnCredential";
const CREDENTIAL_LIFETIME_SECONDS = 48 * 60 * 60;

type StoredCredential = {
  apiKey: string;
  createdAt: string;
};

type MeteredCredentialResponse = {
  username?: string;
  password?: string;
  apiKey?: string;
};

function getMeteredBaseUrl(): string {
  const domain = process.env.METERED_DOMAIN?.trim();
  if (!domain) throw new Error("METERED_DOMAIN is not configured");

  const normalized = domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  if (!/^[a-z0-9.-]+$/i.test(normalized)) {
    throw new Error("Invalid METERED_DOMAIN");
  }

  return `https://${normalized}`;
}

function getMeteredSecret(): string {
  const secret = process.env.METERED_SECRET_KEY?.trim();
  if (!secret) throw new Error("METERED_SECRET_KEY is not configured");
  return secret;
}

export async function createMeteredCredential(): Promise<StoredCredential> {
  const baseUrl = getMeteredBaseUrl();
  const secret = getMeteredSecret();

  const response = await fetch(
    `${baseUrl}/api/v1/turn/credential?secretKey=${encodeURIComponent(secret)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expiryInSeconds: CREDENTIAL_LIFETIME_SECONDS,
        label: "uzon-production-rotating",
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Metered credential creation failed (${response.status})`);
  }

  const result = (await response.json()) as MeteredCredentialResponse;

  if (
    typeof result.apiKey !== "string" ||
    !result.apiKey ||
    typeof result.username !== "string" ||
    !result.username ||
    typeof result.password !== "string" ||
    !result.password
  ) {
    throw new Error("Metered returned an incomplete credential");
  }

  const credential: StoredCredential = {
    apiKey: result.apiKey,
    createdAt: new Date().toISOString(),
  };

  await db
    .insert(appConfig)
    .values({
      key: TURN_CONFIG_KEY,
      value: credential,
    })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: {
        value: credential,
        updatedAt: new Date(),
      },
    });

  return credential;
}

export async function getStoredMeteredCredential(): Promise<StoredCredential | null> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, TURN_CONFIG_KEY))
    .limit(1);

  if (!row || typeof row.value !== "object" || row.value === null) {
    return null;
  }

  const value = row.value as Partial<StoredCredential>;

  if (
    typeof value.apiKey !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  return {
    apiKey: value.apiKey,
    createdAt: value.createdAt,
  };
}

export async function getMeteredIceServers() {
  const credential = await getStoredMeteredCredential();

  if (!credential) {
    throw new Error("TURN credentials have not been initialized");
  }

  const response = await fetch(
    `${getMeteredBaseUrl()}/api/v1/turn/credentials?apiKey=${encodeURIComponent(credential.apiKey)}`,
    { method: "GET", cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`Metered ICE lookup failed (${response.status})`);
  }

  const result: unknown = await response.json();

  if (!Array.isArray(result)) {
    throw new Error("Metered returned an invalid ICE server list");
  }

  const iceServers = result
    .filter(
      (item): item is {
        urls: string | string[];
        username?: string;
        credential?: string;
      } =>
        typeof item === "object" &&
        item !== null &&
        "urls" in item &&
        (typeof item.urls === "string" || Array.isArray(item.urls)),
    )
    .map((item) => ({
      urls: Array.isArray(item.urls) ? item.urls : [item.urls],
      ...(typeof item.username === "string" ? { username: item.username } : {}),
      ...(typeof item.credential === "string"
        ? { credential: item.credential }
        : {}),
    }));

  if (iceServers.length === 0) {
    throw new Error("Metered returned no usable ICE servers");
  }

  return iceServers;
}

export function getMeteredCredentialAgeHours(createdAt: string): number {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;

  return (Date.now() - timestamp) / (60 * 60 * 1000);
}
