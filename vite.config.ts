import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    // Rapier's compatibility build contains the physics WASM in its local JS payload.
    chunkSizeWarningLimit: 4800,
    rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'rapier', test: /[\\/]@dimforge[\\/]/, priority: 2 },
      { name: 'three', test: /[\\/]three[\\/]/, priority: 1 },
    ] } } },
  },
});
