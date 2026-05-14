import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** GitHub project pages live at /<repo>/; set VITE_BASE_PATH in CI (see .github/workflows). */
const base = process.env.VITE_BASE_PATH?.replace(/\/?$/, '/') ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
});
