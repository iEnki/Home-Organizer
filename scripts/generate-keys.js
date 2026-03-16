#!/usr/bin/env node
/**
 * generate-keys.js
 * Generiert alle kryptografischen Schlüssel für die Umzughelfer + Supabase Installation.
 * Ausgabe: JSON mit allen generierten Werten.
 *
 * Verwendung: node scripts/generate-keys.js
 */

const crypto = require("crypto");

// ---- JWT Helper (kein externes npm-Paket erforderlich) ----
function signJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

// ---- VAPID Keys (EC P-256) ----
function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  // Raw uncompressed public key: letzten 65 Bytes der SPKI DER-Kodierung
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const pubRaw = pubDer.slice(-65);

  // Raw private key: Bytes 36–68 der PKCS8 DER-Kodierung
  const privDer = privateKey.export({ type: "pkcs8", format: "der" });
  const privRaw = privDer.slice(36, 68);

  return {
    publicKey: pubRaw.toString("base64url"),
    privateKey: privRaw.toString("base64url"),
  };
}

// ---- Main ----
const jwtSecret = crypto.randomBytes(40).toString("hex");
const now = Math.floor(Date.now() / 1000);
const tenYears = 10 * 365 * 24 * 3600;

const anonKey = signJwt(
  { role: "anon", iss: "supabase", iat: now, exp: now + tenYears },
  jwtSecret
);

const serviceRoleKey = signJwt(
  { role: "service_role", iss: "supabase", iat: now, exp: now + tenYears },
  jwtSecret
);

const vapid = generateVapidKeys();

const result = {
  POSTGRES_PASSWORD: crypto.randomBytes(20).toString("hex"),
  JWT_SECRET: jwtSecret,
  SECRET_KEY_BASE: crypto.randomBytes(64).toString("hex"),
  VAULT_ENC_KEY: crypto.randomBytes(16).toString("hex"),
  PG_META_CRYPTO_KEY: crypto.randomBytes(16).toString("hex"),
  LOGFLARE_PUBLIC_ACCESS_TOKEN: crypto.randomBytes(20).toString("hex"),
  LOGFLARE_PRIVATE_ACCESS_TOKEN: crypto.randomBytes(20).toString("hex"),
  S3_PROTOCOL_ACCESS_KEY_ID: crypto.randomBytes(10).toString("hex"),
  S3_PROTOCOL_ACCESS_KEY_SECRET: crypto.randomBytes(20).toString("hex"),
  ANON_KEY: anonKey,
  SERVICE_ROLE_KEY: serviceRoleKey,
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
};

process.stdout.write(JSON.stringify(result) + "\n");
