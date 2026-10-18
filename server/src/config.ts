/**
 * Server configuration, parsed from environment variables with safe defaults.
 * Secrets are read here only — never logged, never sent to the client.
 */

// Load the package-local .env file (server/.env) when present. Real shell /
// hosting environment variables always win: file values are only applied for
// keys that are not already set. Works in dev (tsx from server/), in tests,
// and from the compiled dist tree.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseEnv } from "node:util";

function findAndLoadPackageEnv(): void {
  // Search upward from this module's directory (covers src/ and dist/server/src).
  let dir = dirname(resolve(import.meta.dirname));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      try {
        const parsed = parseEnv(readFileSync(candidate, "utf8"));
        for (const [key, value] of Object.entries(parsed)) {
          if (process.env[key] === undefined) process.env[key] = value;
        }
      } catch {
        // A malformed .env must never crash the app; defaults still apply.
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
findAndLoadPackageEnv();

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  ai: {
    provider: (process.env.AI_PROVIDER ?? "curated").toLowerCase(),
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    // Owner attestation that the Gemini terms/audience gate was reviewed.
    complianceAttested: bool(process.env.GEMINI_AUDIENCE_COMPLIANCE_ATTESTED, false),
    // Hard request cap for AI routes (per window), independent of provider quota.
    rateLimit: {
      windowMs: 60_000,
      maxRequests: Number(process.env.AI_RATE_LIMIT_MAX ?? 20),
    },
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 15_000),
    maxInputChars: Number(process.env.AI_MAX_INPUT_CHARS ?? 4000),
    maxOutputChars: Number(process.env.AI_MAX_OUTPUT_CHARS ?? 4000),
  },
} as const;

/**
 * The Gemini adapter is enabled only when ALL of the following hold:
 *  1. AI_PROVIDER=gemini is explicitly requested.
 *  2. A server-side API key is present.
 *  3. The responsible project owner has attested (via env) that the current
 *     Gemini API terms and the intended app audience were reviewed and comply.
 *
 * The Gemini API Additional Terms require users to be 18+ and prohibit API
 * clients directed at or likely to be accessed by individuals under 18. For a
 * student audience this gate will normally fail, and the curated fallback is
 * used instead.
 */
export function isGeminiEnabled(): boolean {
  return (
    config.ai.provider === "gemini" &&
    config.ai.geminiApiKey.length > 0 &&
    config.ai.complianceAttested
  );
}
