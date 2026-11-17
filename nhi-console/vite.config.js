import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The console runs in the browser. What it shares between people (the live
 * workspace) and what it sends out (alert email, Jira issues) is answered by
 * server/notify-relay.mjs under /notify-api - and that is built into the dev
 * and preview servers here, so `npm run dev` alone gives two browsers the same
 * live workspace. In production the same code runs as `npm start` or next to
 * nginx in the container.
 *
 * Set NOTIFY_RELAY_URL only to point the dev server at a relay running
 * somewhere else instead.
 */
const ROOT = fileURLToPath(new URL('.', import.meta.url));

function liveWorkspace(env) {
  let handler = null;
  const load = async () => {
    if (handler) return handler;
    /* The relay reads its settings (DATA_DIR, Gmail/SMTP, Jira) from the
       environment: hand it the .env values that are not for the browser. */
    for (const [key, value] of Object.entries(env)) if (!key.startsWith('VITE_') && process.env[key] === undefined) process.env[key] = value;
    ({ handleRequest: handler } = await import('./server/notify-relay.mjs'));
    return handler;
  };
  const mount = (server) => {
    server.middlewares.use('/notify-api', async (req, res) => {
      try {
        (await load())(req, res);
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, message: `The live workspace failed to start: ${error.message}` }));
      }
    });
  };
  return { name: 'nhi-live-workspace', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT, '');
  const external = (env.NOTIFY_RELAY_URL || '').trim();

  return {
    envDir: ROOT,
    plugins: [react(), tailwindcss(), ...(external ? [] : [liveWorkspace(env)])],
    server: {
      port: 3000,
      proxy: external ? { '/notify-api': { target: external, changeOrigin: true, rewrite: (path) => path.replace(/^\/notify-api/, '') } } : undefined,
    },
    preview: { port: 3000 },
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
