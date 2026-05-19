import { defineConfig } from 'vite';

// Vercel sets VERCEL=1 automatically; GitHub Pages needs the repo subfolder
const base = process.env.VERCEL ? '/' : '/my-pln-dashboard/';

export default defineConfig({
  base,
  root: '.',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Target modern browsers — keeps bundle lean
    target: 'es2020',
    cssMinify: true,
    // Warn if any chunk exceeds 600 kB gzipped
    chunkSizeWarningLimit: 600,
  },

  server: {
    port: 5173,
    // Open browser on dev start
    open: true,
  },

  preview: {
    port: 4173,
  },
});
