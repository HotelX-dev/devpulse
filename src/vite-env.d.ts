/// <reference types="vite/client" />

/** Set in `vite.config.ts` from `public/version.json` at build time. */
declare const __APP_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
