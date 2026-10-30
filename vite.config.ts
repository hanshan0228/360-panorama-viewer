import { defineConfig, type HtmlTagDescriptor } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const fallbackStyles = `
  body { margin: 0; background: #0b1115; }
  [data-app-startup] { display: none; }
  .app-booting [data-app-fallback] { display: none; }
  .app-booting [data-app-startup] {
    box-sizing: border-box; min-height: 100vh; padding: 24px;
    display: grid; place-content: center; justify-items: center; gap: 24px;
    background: #0b1115; color: #bccfca; text-align: center;
    font: 16px/1.75 'Aptos', 'Trebuchet MS', 'Microsoft YaHei', sans-serif;
  }
  [data-app-startup] .startup-orb {
    width: 64px; height: 64px; border: 1px solid #30484b; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #9ee6d3, #172e36 65%);
  }
  [data-app-startup] p { margin: 0; }
  [data-app-startup] button {
    min-height: 44px; padding: 8px 16px; border: 1px solid #30484b; border-radius: 8px;
    background: #111c22; color: #9ee6d3; font: inherit; cursor: pointer;
  }
  [data-app-startup] button:focus-visible { outline: 2px solid #9ee6d3; outline-offset: 4px; }
  [data-app-fallback] {
    box-sizing: border-box; min-height: 100vh; padding: clamp(24px, 5vw, 72px);
    background: #0b1115; color: #e8eff0;
    font: 16px/1.75 'Aptos', 'Trebuchet MS', 'Microsoft YaHei', sans-serif;
    overflow-wrap: anywhere;
  }
  [data-app-fallback] :is(header, main) { max-width: 1120px; margin: 0 auto; }
  [data-app-fallback] header {
    box-sizing: border-box; padding: clamp(24px, 5vw, 64px);
    margin-bottom: 32px; border: 1px solid #30484b; border-radius: 24px;
    background: linear-gradient(135deg, #172e36, #111c22);
  }
  [data-app-fallback] h1 {
    margin: 0 0 24px; max-width: 20ch; color: #e8eff0;
    font-size: clamp(32px, 5vw, 64px); line-height: 1.1; letter-spacing: -.03em;
  }
  [data-app-fallback] h2 { margin: 32px 0 16px; font-size: 24px; line-height: 1.3; }
  [data-app-fallback] h3 { margin: 24px 0 12px; font-size: 20px; line-height: 1.4; }
  [data-app-fallback] p { margin: 0 0 20px; max-width: 76ch; color: #bccfca; }
  [data-app-fallback] :is(ul, ol) { padding-left: 24px; margin: 16px 0 24px; }
  [data-app-fallback] li { margin-bottom: 12px; }
  [data-app-fallback] a { color: #9ee6d3; text-decoration: underline; }
  [data-app-fallback] a:focus-visible { outline: 2px solid #9ee6d3; outline-offset: 4px; }
  [data-app-fallback] pre { overflow-x: auto; padding: 16px; background: #111c22; }
  [data-app-fallback] table { display: block; max-width: 100%; overflow-x: auto; }
  [data-app-fallback] :is(th, td) { padding: 8px; text-align: left; }
`;

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
    {
      name: 'style-app-fallback',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          const isApp = html.includes('<script type="module" src="/src/main.tsx"></script>');
          const themeColor = isApp ? '#0b1115' : '#040c1a';
          html = html.replace(/<meta\b[^>]*name=["'](?:color-scheme|theme-color)["'][^>]*>/gi, '');
          const tags: HtmlTagDescriptor[] = [
            { tag: 'meta', attrs: { name: 'color-scheme', content: 'dark' }, injectTo: 'head' as const },
            { tag: 'meta', attrs: { name: 'theme-color', content: themeColor }, injectTo: 'head' as const },
            { tag: 'style', children: 'html:root { color-scheme: dark; color-scheme: only dark; }', injectTo: 'head' as const },
          ];
          const gaId = process.env.VITE_GA_MEASUREMENT_ID || 'G-26B4KXE1NK';
          if (gaId && !html.includes('googletagmanager.com/gtag/js')) {
            tags.push(
              {
                tag: 'script',
                attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${gaId}` },
                injectTo: 'head' as const,
              },
              {
                tag: 'script',
                children: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${gaId}', {page_location: location.origin + location.pathname${isApp ? ', send_page_view: false' : ''}});`,
                injectTo: 'head' as const,
              },
            );
          }
          if (!isApp) return { html, tags };
          // ponytail: React replaces both blocks on mount; no timer or mount observer is needed.
          const startup = `<div data-app-startup><span class="startup-orb" aria-hidden="true"></span><p role="status">Loading…</p><button type="button" onclick="document.documentElement.classList.remove('app-booting')">View basic page</button></div>`;
          return {
            html: html.replace(
              /<div id="root">([\s\S]*?)<\/div>(\s*<script type="module" src="\/src\/main\.tsx"><\/script>)/,
              `<div id="root">${startup}<div data-app-fallback>$1</div></div>$2`,
            ),
            tags: [...tags,
              { tag: 'style', children: fallbackStyles, injectTo: 'head' },
              { tag: 'script', children: "document.documentElement.classList.add('app-booting');", injectTo: 'head-prepend' },
            ],
          };
        },
      },
    },
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
