// Resource bindings are generated from wrangler.jsonc; secrets are runtime-only.
export type BackendEnv = Env & { TURNSTILE_SECRET?: string; TURNSTILE_SITE_KEY?: string; RECOVERY_CODE_SECRET?: string; RECOVERY_DELIVERY?: Fetcher };
