import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The console runs in the browser and needs no backend. The one exception is
 * the notification relay (server/notify-relay.mjs: alert email through Amazon
 * SES, Jira issues), which the dev server proxies under /notify-api, exactly
 * as nginx does in production. Start it with `npm run relay`.
 */
const ROOT = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT, '');
  const relay = (env.NOTIFY_RELAY_URL || 'http://127.0.0.1:8787').trim();

  return {
    envDir: ROOT,
    plugins: [react(), tailwindcss()],
    server: {
      port: 3000,
      proxy: {
        '/notify-api': { target: relay, changeOrigin: true, rewrite: (path) => path.replace(/^\/notify-api/, '') },
      },
    },
    // No source maps, no comments, no console output in the shipped bundle.
    build: {
      outDir: 'dist',
      sourcemap: false,
      rolldownOptions: {
        output: {
          comments: false,
          minify: { compress: { dropConsole: true, dropDebugger: true } },
        },
      },
    },
  };
});
