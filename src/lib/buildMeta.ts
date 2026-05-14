/** Injected at build time by Vite (`vite.config.ts` + `scripts/write-version.mjs`). */
declare const __APP_BUILD_ID__: string;

export const RUNNING_BUILD_ID: string =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';
