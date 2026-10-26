import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    lib: {
      entry: 'src/main/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'electron-updater',
        'better-sqlite3',
        'fluent-ffmpeg',
        'chokidar',
        'systeminformation',
        'path',
        'fs',
        'child_process',
        'os',
        'events',
        'url',
        'node:url',
      ],
    },
    target: 'node18',
    minify: false,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
});
