import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const domain = 'https://360panoramaviewer.com';
const slugs = ['', '360-panorama-viewer', 'photo-to-globe', 'cubemap-generator', 'photo-to-360-converter'];
const languages = ['en', 'zh', 'es', 'de', 'ja'];
const app = ts.createSourceFile('App.tsx', read('src/App.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function evaluate(node, globals) {
  const code = ts.transpileModule(`(${node.getText(app)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(code, globals);
}

function seoEffect() {
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(app) === 'useEffect'
      && node.arguments[0]?.getText(app).includes('const tabSeoMap')) callback = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(app);
  assert.ok(callback, 'the actual application SEO effect must be exercised');
  return callback;
}

test('mounted route metadata keeps new URLs independent and restores older routes', () => {
  const callback = seoEffect();
  const attributes = new Map();
  const document = { title: '', querySelector: selector => ({
    setAttribute: (name, value) => attributes.set(`${selector}:${name}`, value),
  }) };
  for (const [currentPath, activeTab, expectedTitle] of [
    ['/hdri-to-cubemap/', 'landing-hdri-viewer', 'HDRI to Cubemap Converter'],
    ['/360-product-video-generator/', 'landing-video', '360 Panorama Showcase Video Generator'],
    ['/360-product-video-generator', 'landing-video', '360 Panorama Showcase Video Generator'],
    ['/hdri-viewer/', 'landing-hdri-viewer', 'HDRI Viewer'],
    ['/cubemap-generator/', 'landing-cubemap', 'Free Cubemap Generator'],
    ['/cubemap-generator/', 'cubemap', 'Free Cubemap Generator'],
    ['/360-photo-to-video/', 'landing-video', '360° Photo to Video Generator'],
    ['/', 'generator', '360 Panorama Viewer'],
  ]) {
    evaluate(callback, { currentPath, activeTab, document })();
    const canonical = domain + (currentPath.endsWith('/') ? currentPath : currentPath + '/');
    assert.equal(attributes.get('link[rel="canonical"]:href'), canonical);
    assert.equal(attributes.get('meta[property="og:url"]:content'), canonical);
    assert.ok(document.title.startsWith(expectedTitle), document.title);
    assert.equal(attributes.get('meta[property="og:title"]:content'), document.title);
    assert.equal(attributes.get('meta[name="twitter:title"]:content'), document.title);
    if (currentPath.includes('hdri-to-cubemap') || currentPath.includes('360-product-video') || currentPath === '/cubemap-generator/') {
      const html = read(currentPath.replace(/^\//, '').replace(/\/?$/, '/index.html'));
      assert.equal(document.title, html.match(/<title>([^<]+)<\/title>/)[1]);
      assert.equal(attributes.get('meta[name="description"]:content'), html.match(/<meta name="description" content="([^"]+)"/)[1]);
    }
  }
});

test('legacy cubemap hash opens the same landing page as the canonical URL', () => {
  const route = app.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getInitialTabFromLocation');
  const code = ts.transpileModule(route.getText(app), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
  for (const [pathname, hash] of [['/', '#cubemap'], ['/cubemap-generator/', '']]) {
    assert.equal(vm.runInNewContext(code + '\ngetInitialTabFromLocation()', {
      window: { location: { pathname, hash } },
    }), 'landing-cubemap');
  }
});

test('HDRI route opens the existing HDR decoder instead of the ordinary-image slicer', () => {
  const route = app.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getInitialTabFromLocation');
  const code = ts.transpileModule(route.getText(app), {
    compilerOptions: { target: ts.ScriptTarget.ES2023 },
  }).outputText;
  for (const pathname of ['/hdri-to-cubemap', '/hdri-to-cubemap/']) {
    assert.equal(vm.runInNewContext(code + '\ngetInitialTabFromLocation()', {
      window: { location: { pathname, hash: '' } },
    }), 'landing-hdri-viewer');
  }
});

test('every language page retains localized content, a working tool link and reciprocal alternates', () => {
  const sitemap = read('public/sitemap.xml');
  for (const slug of slugs) for (const lang of languages) {
    const route = `/${lang === 'en' ? '' : lang + '/'}${slug ? slug + '/' : ''}`;
    const html = read(route.slice(1) + 'index.html');
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.ok(html.includes(`<link rel="canonical" href="${domain}${route}"`));
    const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
    assert.equal(alternates.length, 6, route);
    for (const [alternateLang, url] of alternates.map(match => match.slice(1))) {
      const prefix = ['en', 'x-default'].includes(alternateLang) ? '' : alternateLang + '/';
      assert.equal(url, `${domain}/${prefix}${slug ? slug + '/' : ''}`);
      assert.ok(sitemap.includes(`hreflang="${alternateLang}" href="${url}"`));
    }
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
    if (lang !== 'en') {
      assert.doesNotMatch(html, /<script\b[^>]*(?:\bsrc=|\btype="module")/);
      assert.ok(html.includes(`class="button" href="/${slug ? slug + '/' : ''}" hreflang="en"`));
      assert.match(html, /aria-current="page"/);
      const main = html.match(/<main[\s\S]*?<\/main>/)[0];
      assert.ok(main.includes('<h1>') && main.includes('<h3>'));
    }
  }
});

test('language regeneration preserves English pages and unchanged sitemap dates', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-i18n-test-'));
  try {
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.mkdirSync(path.join(directory, 'public'));
    fs.writeFileSync(path.join(directory, 'scripts/generate-i18n-pages.mjs'), read('scripts/generate-i18n-pages.mjs'));
    fs.writeFileSync(path.join(directory, 'public/sitemap.xml'), read('public/sitemap.xml'));
    for (const slug of slugs) {
      fs.mkdirSync(path.join(directory, slug), { recursive: true });
      fs.writeFileSync(path.join(directory, slug, 'index.html'), read((slug ? slug + '/' : '') + 'index.html'));
    }
    const { generateAllI18n } = await import(pathToFileURL(path.join(directory, 'scripts/generate-i18n-pages.mjs')).href);
    generateAllI18n();
    const sitemapPath = path.join(directory, 'public/sitemap.xml');
    const firstSitemap = fs.readFileSync(sitemapPath, 'utf8');
    const englishDate = xml => xml.match(/<loc>https:\/\/360panoramaviewer\.com\/cubemap-generator\/<\/loc>\s*<lastmod>([^<]+)/)[1];
    assert.equal(englishDate(firstSitemap), englishDate(read('public/sitemap.xml')));
    for (const slug of slugs) assert.equal(fs.readFileSync(path.join(directory, slug, 'index.html'), 'utf8'), read((slug ? slug + '/' : '') + 'index.html'));
    generateAllI18n();
    assert.equal(fs.readFileSync(sitemapPath, 'utf8'), firstSitemap, 'an unchanged regeneration must not refresh dates');
    for (const lang of languages.filter(language => language !== 'en')) {
      const html = fs.readFileSync(path.join(directory, lang, 'cubemap-generator/index.html'), 'utf8');
      const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
      const description = graph.find(entity => entity['@type'] === 'SoftwareApplication').description;
      const faq = JSON.stringify(graph.find(entity => entity['@type'] === 'FAQPage'));
      // Check the tool's output claim; other tools and input examples may mention WebGL or larger images.
      const faceSizes = [...description.matchAll(/\b(?:256|512|1024|2048|4096)\b/g)].map(match => Number(match[0]));
      assert.deepEqual(faceSizes, [256, 512, 1024]);
      assert.doesNotMatch(description, /WebGL/);
      assert.match(faq, /TextureCube/);
      assert.match(faq, /\.hdr/);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('new tool pages make no unbacked rating or percentage promises', () => {
  for (const slug of ['360-product-video-generator', 'hdri-to-cubemap']) {
    const html = read(slug + '/index.html');
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.ok(schema['@graph'].some(entity => entity['@type'] === 'SoftwareApplication'));
    assert.ok(schema['@graph'].every(entity => !entity.aggregateRating));
    assert.doesNotMatch(html, /(?:30|25)%/);
  }
  assert.match(read('hdri-to-cubemap/index.html'), /OpenEXR is not supported/);
  assert.match(read('hdri-to-cubemap/index.html'), /8-bit PNG/);
  assert.match(read('360-product-video-generator/index.html'), /does not reconstruct/);
});

for (const status of [200, 202, 403, 429, 500, 'network error']) {
  test(`IndexNow exposes submission outcome: ${status}`, async () => {
    const process = { exitCode: 0 };
    await vm.runInNewContext(read('scripts/submit-indexnow.mjs'), {
      process, AbortSignal, console: { log() {}, error() {} },
      fetch: async (url, options) => {
        assert.equal(url, 'https://api.indexnow.org/indexnow');
        assert.ok(options.signal instanceof AbortSignal);
        const payload = JSON.parse(options.body);
        assert.equal(payload.host, '360panoramaviewer.com');
        assert.equal(payload.urlList.length, 27);
        if (status === 'network error') throw new Error('ECONNRESET');
        return { status, text: async () => 'response' };
      },
    });
    assert.equal(process.exitCode, status === 200 || status === 202 ? 0 : 1);
  });
}
