// Resource bindings/configuration are generated; secret values stay runtime-only.
export type BackendEnv = Env & {
  TURNSTILE_SECRET?: string; TURNSTILE_SITE_KEY?: string;
  RECOVERY_CODE_SECRET?: string; RECOVERY_DELIVERY?: Fetcher;
  AUTH_SIGNING_SECRET?: string;
  AWS_ACCESS_KEY_ID?: string; AWS_SECRET_ACCESS_KEY?: string; AWS_SESSION_TOKEN?: string;
};
