import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'public', // redesign: copies public/assets/search.js into build/assets
  build: {
    outDir: 'build',
    target: 'esnext',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        assetFileNames: 'assets/[name][extname]',
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
      },
    },
  },
});
