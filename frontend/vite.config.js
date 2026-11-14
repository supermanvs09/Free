import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/*
 * One self-contained page: scripts, styles and images are inlined at build
 * time (see scripts/inline.mjs), so the console can be published as a single
 * file and needs no server of its own.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { 'lucide-react': fileURLToPath(new URL('./src/icons.jsx', import.meta.url)) } },
  server: { port: 3000 },
  build: {
    chunkSizeWarningLimit: 4000,
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        codeSplitting: false,
        comments: false,
        minify: { compress: { dropConsole: true, dropDebugger: true } },
      },
    },
  },
});
