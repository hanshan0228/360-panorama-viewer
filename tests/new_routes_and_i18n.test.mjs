import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('360 product video generator page has required SEO and schema tags', () => {
  const htmlPath = path.join(rootDir, '360-product-video-generator', 'index.html');
  assert.ok(fs.existsSync(htmlPath), '360-product-video-generator/index.html must exist');
  const content = fs.readFileSync(htmlPath, 'utf8');

  assert.match(content, /<title>360 Product Video Generator/);
  assert.match(content, /<link rel="canonical" href="https:\/\/360panoramaviewer\.com\/360-product-video-generator\/" \/>/);
  assert.match(content, /Shopify/);
  assert.match(content, /Amazon/);
  assert.match(content, /SoftwareApplication/);
  assert.match(content, /FAQPage/);
});

test('hdri to cubemap page has required SEO and schema tags', () => {
  const htmlPath = path.join(rootDir, 'hdri-to-cubemap', 'index.html');
  assert.ok(fs.existsSync(htmlPath), 'hdri-to-cubemap/index.html must exist');
  const content = fs.readFileSync(htmlPath, 'utf8');

  assert.match(content, /<title>HDRI to Cubemap Converter/);
  assert.match(content, /<link rel="canonical" href="https:\/\/360panoramaviewer\.com\/hdri-to-cubemap\/" \/>/);
  assert.match(content, /Unity/);
  assert.match(content, /Unreal Engine/);
  assert.match(content, /SoftwareApplication/);
  assert.match(content, /FAQPage/);
});

test('multilingual pages have valid hreflang alternate tags', () => {
  const samplePages = [
    path.join(rootDir, 'zh', '360-panorama-viewer', 'index.html'),
    path.join(rootDir, 'es', 'photo-to-globe', 'index.html'),
    path.join(rootDir, 'de', 'cubemap-generator', 'index.html'),
    path.join(rootDir, 'ja', 'photo-to-360-converter', 'index.html'),
  ];

  for (const pagePath of samplePages) {
    assert.ok(fs.existsSync(pagePath), `${pagePath} must exist`);
    const content = fs.readFileSync(pagePath, 'utf8');
    assert.match(content, /hreflang="en"/);
    assert.match(content, /hreflang="zh"/);
    assert.match(content, /hreflang="es"/);
    assert.match(content, /hreflang="de"/);
    assert.match(content, /hreflang="ja"/);
    assert.match(content, /hreflang="x-default"/);
    assert.match(content, /<script type="module" src="\/src\/main\.tsx"><\/script>/);
  }
});

test('sitemap.xml contains new tool routes and hreflang alternates', () => {
  const sitemapPath = path.join(rootDir, 'public', 'sitemap.xml');
  const content = fs.readFileSync(sitemapPath, 'utf8');

  assert.match(content, /https:\/\/360panoramaviewer\.com\/360-product-video-generator\//);
  assert.match(content, /https:\/\/360panoramaviewer\.com\/hdri-to-cubemap\//);
  assert.match(content, /xhtml:link rel="alternate" hreflang="es"/);
  assert.match(content, /xhtml:link rel="alternate" hreflang="de"/);
  assert.match(content, /xhtml:link rel="alternate" hreflang="ja"/);
  assert.match(content, /xhtml:link rel="alternate" hreflang="zh"/);
});
