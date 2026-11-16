import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';

/*
 * The console as one self-contained page (npm run build:artifact): screens in
 * memory, no shared workspace server, everything in one script, the scenario
 * panel open. scripts/pack-artifact.mjs then inlines it into a single file.
 */
export default defineConfig((env) =>
  mergeConfig(base(env), {
    define: {
      'import.meta.env.VITE_ROUTER': JSON.stringify('memory'),
      'import.meta.env.VITE_SYNC': JSON.stringify('off'),
      'import.meta.env.VITE_PRESENT': JSON.stringify('on'),
      'import.meta.env.VITE_LOCAL_LATENCY': JSON.stringify('90'),
    },
    build: {
      outDir: 'dist-artifact',
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      rolldownOptions: { output: { inlineDynamicImports: true } },
    },
  }),
);
