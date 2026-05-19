import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves from /my-pln-dashboard/ — must match repo name
  base: '/my-pln-dashboard/',
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
