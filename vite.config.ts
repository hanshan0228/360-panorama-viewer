import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

function getHtmlInputs() {
  const root = import.meta.dirname;
  const entries: Record<string, string> = {};
  const scan = (dir: string) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'dist' || item.name === 'public' || item.name === '.git' || item.name === 'tests' || item.name === 'output') continue;
        scan(path.join(dir, item.name));
      } else if (item.name === 'index.html') {
        const fullPath = path.join(dir, item.name);
        const rel = path.relative(root, fullPath);
        const key = rel === 'index.html' ? 'main' : rel.replace(/\/index\.html$/, '').replace(/[/-]/g, '_');
        entries[key] = fullPath;
      }
    }
  };
  scan(root);
  return entries;
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? '/360-panorama-viewer/' : '/'),
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: getHtmlInputs(),
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/canvas-confetti') ||
            id.includes('node_modules/jszip')
          ) {
            return 'vendor-utils';
          }
        },
      },
    },
  },
})
