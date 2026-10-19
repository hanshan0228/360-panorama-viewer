import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? '/panorama-generator/' : '/'),
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
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        maker: resolve(import.meta.dirname, '360-image-maker/index.html'),
        viewer: resolve(import.meta.dirname, '360-panorama-viewer/index.html'),
        globe: resolve(import.meta.dirname, 'photo-to-globe/index.html'),
        hdri: resolve(import.meta.dirname, 'ai-hdri-generator/index.html'),
        skybox: resolve(import.meta.dirname, 'skybox-generator/index.html'),
        photo360: resolve(import.meta.dirname, 'photo-to-360-converter/index.html'),
        cubemap: resolve(import.meta.dirname, 'cubemap-generator/index.html'),
        metadata: resolve(import.meta.dirname, '360-metadata-injector/index.html'),
        video: resolve(import.meta.dirname, '360-photo-to-video/index.html'),
        showcase: resolve(import.meta.dirname, 'showcase/index.html'),
      },
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
