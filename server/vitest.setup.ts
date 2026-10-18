/**
 * Test isolation: the package .env (which enables real providers for dev)
 * must never leak into the deterministic test suite. Pinning these first
 * means the config module's .env loader respects the pre-set test defaults
 * (it only fills keys that are unset).
 */
process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? "curated";
process.env.GEMINI_AUDIENCE_COMPLIANCE_ATTESTED =
  process.env.GEMINI_AUDIENCE_COMPLIANCE_ATTESTED ?? "";
