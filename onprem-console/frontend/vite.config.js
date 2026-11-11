import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/* The on-premises API (onprem-console/backend) serves /api and /webhooks on one
   origin; the dev server proxies both to it, as nginx does in production. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = (env.ONPREM_API_UPSTREAM || 'http://localhost:8090').trim();
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 3100, proxy: { '/api': target, '/webhooks': target, '/healthz': target } },
    build: { outDir: 'dist', sourcemap: false },
  };
});
