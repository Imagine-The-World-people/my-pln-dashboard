import { defineConfig } from 'vite';

export default defineConfig({
  // Root is the project directory (index.html at root)
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
