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

function languageHarness(url, stored, blockedStorage = false) {
  const events = new EventTarget();
  const document = { documentElement: { lang: 'en' } };
  const storage = new Map(stored === undefined ? [] : [['panorama_user_lang', stored]]);
  const window = {
    location: new URL(url),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blockedStorage) throw new Error('Storage blocked'); storage.set(key, value); },
    },
    history: {
      pushState(_state, _title, next) { window.location = new URL(next, window.location); },
      replaceState(_state, _title, next) { window.location = new URL(next, window.location); },
    },
  };
  const module = { exports: {} };
  const react = {
    useEffect: callback => callback(),
    useSyncExternalStore: (subscribe, snapshot) => { subscribe(() => {}); return snapshot(); },
  };
  const code = ts.transpileModule(read('src/utils/i18n.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText;
  vm.runInNewContext(code, { window, document, URL, URLSearchParams, module, exports: module.exports,
    require: specifier => { assert.equal(specifier, 'react'); return react; },
  });
  return { ...module.exports, window, document, storage, events };
}

test('interface language validates URL and saved preferences, including blocked storage', () => {
  for (const [query, saved, blocked, expected] of [
    ['?lang=zh', 'ja', false, 'zh'], ['', 'es', false, 'es'],
    ['?lang=invalid', 'de', false, 'de'], ['?lang=__proto__', 'invalid', false, 'en'],
    ['?lang=ja', undefined, true, 'ja'], ['', undefined, true, 'en'],
  ]) {
    const harness = languageHarness(domain + '/' + query, saved, blocked);
    assert.equal(harness.getStoredLanguage(), expected);
  }
});

test('interface selection preserves URL context and supports history without usable storage', () => {
  const harness = languageHarness(domain + '/?campaign=guide#viewer', undefined, true);
  harness.useLanguage();
  harness.saveStoredLanguage('de');
  assert.equal(harness.window.location.href, domain + '/?campaign=guide&lang=de#viewer');
  assert.equal(harness.document.documentElement.lang, 'de');
  harness.saveStoredLanguage('invalid');
  assert.equal(harness.document.documentElement.lang, 'de');
  harness.window.location = new URL(domain + '/?campaign=guide&lang=es#viewer');
  harness.events.dispatchEvent(new Event('popstate'));
  assert.equal(harness.useLanguage()[0], 'es');
  harness.saveStoredLanguage('en');
  assert.equal(harness.window.location.href, domain + '/?campaign=guide#viewer');
  assert.equal(harness.document.documentElement.lang, 'en');
});

test('local links preserve query values and hashes while selecting an interface language', () => {
  const { withLanguageHref } = languageHarness(domain + '/?lang=zh');
  assert.equal(withLanguageHref('/hdri-viewer/?sample=a%26b#preview', 'ja'), '/hdri-viewer/?sample=a%26b&lang=ja#preview');
  assert.equal(withLanguageHref('/?lang=de&campaign=guide#viewer', 'en'), '/?campaign=guide#viewer');
  assert.equal(withLanguageHref('https://example.com/path?lang=de', 'zh'), 'https://example.com/path?lang=de');
  assert.equal(withLanguageHref('//example.com/path', 'ja'), '//example.com/path');
  assert.equal(withLanguageHref('#help', 'zh'), '#help');
});

test('interface translations use the active language and retain unknown technical text', () => {
  const harness = languageHarness(domain + '/?lang=zh');
  const messages = { en: {}, zh: { Generate: '生成' }, es: { Generate: 'Generar' }, de: { Generate: 'Generieren' }, ja: { Generate: '生成' } };
  assert.equal(harness.useTranslation(messages)('Generate'), '生成');
  assert.equal(harness.useTranslation(messages)('TextureCube'), 'TextureCube');
  for (const text of ['__proto__', 'constructor', 'toString']) assert.equal(harness.useTranslation(messages)(text), text);
  harness.saveStoredLanguage('es');
  assert.equal(harness.useTranslation(messages)('Generate'), 'Generar');
});

test('all interface dictionaries cover their component messages in every supported language', () => {
  const groups = [
    ['shellTranslations', ['src/App.tsx']],
    ['generatorTranslations', ['src/components/GeneratorTab.tsx', 'src/components/commercial/EmbedModal.tsx', 'src/components/commercial/UserAuthModal.tsx', 'src/components/commercial/VerificationChallenge.tsx']],
    ['toolTranslations', ['src/components/ViewerTab.tsx', 'src/components/CubemapTab.tsx', 'src/components/landing/CubemapGeneratorPage.tsx']],
    ['viewerTranslations', ['src/components/SphereViewer.tsx']],
    ['sharedTranslations', ['src/components/HeroPanorama.tsx', 'src/components/commercial/FeatureMatrix.tsx', 'src/components/commercial/HowItWorksSteps.tsx', 'src/components/commercial/IntegrationBadges.tsx', 'src/components/commercial/CommercialFaq.tsx', 'src/components/commercial/EmbedViewer.tsx']],
    ['commerceTranslations', ['src/components/PricingTab.tsx', 'src/components/commercial/CheckoutModal.tsx', 'src/components/commercial/SharePanorama.tsx', 'src/components/commercial/MyWorks.tsx', 'src/components/commercial/ShowcaseGallery.tsx', 'src/components/landing/ShowcasePage.tsx']],
    ['specialistTranslations', ['src/components/landing/AiHdriGeneratorPage.tsx', 'src/components/landing/CubemapToEquirectPage.tsx', 'src/components/landing/HdriViewerPage.tsx', 'src/components/landing/MetadataInjectorPage.tsx', 'src/components/commercial/MetadataInjectorModal.tsx']],
    ['advancedTranslations', ['src/components/landing/SkyboxGeneratorPage.tsx', 'src/components/landing/TextToPanoramaPage.tsx', 'src/components/landing/PhotoToVideoPage.tsx', 'src/components/landing/DevelopersPage.tsx', 'src/components/commercial/PhotoToVideoModal.tsx']],
    ['landingTranslations', ['src/components/GlobeTab.tsx', 'src/components/GlobeViewer.tsx', 'src/components/landing/PhotoToGlobePage.tsx', 'src/components/landing/PhotoTo360Page.tsx']],
  ];
  for (const [name, files] of groups) {
    const module = { exports: {} };
    const code = ts.transpileModule(read(`src/utils/${name}.ts`), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports });
    const dictionaries = Object.values(module.exports).filter(value => value && languages.every(lang => typeof value[lang] === 'object'));
    assert.equal(dictionaries.length, 1, name);
    const dictionary = dictionaries[0];
    const keys = Object.keys(dictionary.zh).sort();
    assert.ok(keys.length > 0, name);
    for (const lang of languages.filter(lang => lang !== 'en')) {
      assert.deepEqual(Object.keys(dictionary[lang]).sort(), keys, `${name}: ${lang}`);
      for (const key of keys) {
        const value = dictionary[lang][key];
        assert.ok(typeof value === 'string' && value.trim(), `${name}/${lang}: ${key}`);
        const placeholders = text => [...text.matchAll(/\{[a-zA-Z][a-zA-Z0-9]*\}/g)].map(match => match[0]).sort();
        assert.deepEqual(placeholders(value), placeholders(key), `${name}/${lang}: preserve dynamic values in ${key}`);
      }
    }
    for (const file of files) {
      const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const technicalText = new Set([
        '.png', 'PNG', 'VR JPG', '.HDR', 'IFRAME', 'Ctrl + V', 'Cmd + V', 'PNG Cubemap', 'MapToGlobe',
        'Blender .HDR', 'Google Street View / Maps', '?pano=https://...', '360 Panorama Viewer',
        'Facebook, Google Photos, Apple Vision Pro, Meta Quest', 'MP4 / WebM', 'YouTube', 'TikTok/Reels',
        '&ldquo;', '&rdquo;', 'Blender &bull; Unreal Engine &bull; Unity', 'Blender 3.x / 4.x',
        'posx.png', 'negx.png', 'posy.png', 'negy.png', 'posz.png', 'negz.png', 'REST API',
        'Access-Control-Allow-Origin: *', 'OPTIONS', '/api/generate', '/api/shares/&#123;id&#125;/image',
        '.hdr &bull; .png &bull; .jpg &bull; .webp', '&times;', 'Facebook 360', 'Google Street View',
        'Kuula &amp; Roundme', 'Meta Quest &amp; Vision Pro', 'TikTok &bull; Reels', 'Blockade Labs',
      ]);
      const visit = node => {
        if (file.startsWith('src/components/') && ts.isJsxText(node)) {
          const text = node.text.trim().replace(/\s+/g, ' ');
          assert.ok(!/[a-zA-Z]{3}/.test(text) || technicalText.has(text), `${file}: untranslated interface text ${text}`);
        }
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
          const key = node.arguments[0].text;
          for (const lang of languages.filter(lang => lang !== 'en')) assert.ok(Object.hasOwn(dictionary[lang], key), `${file}/${lang}: ${key}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
});

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
      assert.ok(html.includes(`class="button" href="/${slug ? slug + '/' : ''}?lang=${lang}" hreflang="${lang}"`));
      assert.ok(html.includes(`href="/${slug ? slug + '/' : ''}?lang=en" lang="en" hreflang="en"`));
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
    for (const route of ['blog/panorama-to-skybox-threejs-unity/', 'examples/panorama-skybox/']) {
      assert.ok(firstSitemap.includes(`<loc>${domain}/${route}</loc>`), 'regeneration must retain the skybox guide and runnable example');
    }
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

test('homepage structured answers agree with both the visible fallback and actual interface', () => {
  const html = read('index.html');
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const source = ts.createSourceFile('CommercialFaq.tsx', read('src/components/commercial/CommercialFaq.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'FAQS') initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(initializer);
  const answers = vm.runInNewContext(`(${initializer.getText(source)})`, { t: text => text });
  const structured = graph.find(entity => entity['@type'] === 'FAQPage').mainEntity;
  assert.equal(structured.length, answers.length);
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
  for (const { question, answer } of answers) {
    assert.equal(structured.find(item => item.name === question)?.acceptedAnswer.text, answer);
    assert.ok(html.includes(`<h3>${escape(question)}</h3>`));
    assert.ok(html.includes(`<p>${escape(answer)}</p>`));
  }
  const software = graph.find(entity => entity['@type'] === 'SoftwareApplication');
  assert.equal(software.offers, undefined, 'do not advertise the credit-backed application as wholly free');
  assert.match(software.description, /account credits/);
  assert.match(software.featureList.join(' '), /256, 512 or 1024/);
});

test('skybox tutorial and runnable example are discoverable and expose real local assets', () => {
  const route = '/blog/panorama-to-skybox-threejs-unity/';
  const html = read('public' + route + 'index.html');
  assert.ok(html.includes(`<link rel="canonical" href="${domain}${route}"`));
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema['@graph'].find(item => item['@type'] === 'TechArticle').url, domain + route);
  assert.match(html, /not an AI-generated scene/);
  assert.match(html, /ordinary 8-bit PNG/);
  for (const match of html.matchAll(/(?:href|src)="(\/[^"?#]*)/g)) {
    const asset = match[1];
    const file = asset.endsWith('/') ? asset + 'index.html' : asset;
    assert.ok([file.slice(1), 'public' + file].some(name => fs.existsSync(new URL('../' + name, import.meta.url))), asset);
  }
  for (const file of ['public/blog/index.html', 'index.html', 'cubemap-generator/index.html', 'skybox-generator/index.html', 'developers/index.html']) {
    assert.ok(read(file).includes(`href="${route}"`), `${file}: crawler-visible guide link`);
  }
  for (const name of ['CubemapGeneratorPage', 'SkyboxGeneratorPage', 'DevelopersPage']) {
    assert.ok(read(`src/components/landing/${name}.tsx`).includes(`href="${route}"`), `${name}: mounted guide link`);
  }
  const demo = read('examples/panorama-skybox/index.html');
  assert.ok(demo.includes('THREE.EquirectangularReflectionMapping'));
  assert.ok(demo.includes('THREE.SRGBColorSpace'));
  assert.doesNotMatch(demo, /https?:\/\/[^"\s]+\.js/);
});

test('photo conversion static copy discloses generative and seam-blending limits', () => {
  const html = read('photo-to-360-converter/index.html');
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  assert.ok(!graph.find(entity => entity['@type'] === 'SoftwareApplication').offers);
  const faqs = graph.find(entity => entity['@type'] === 'FAQPage').mainEntity;
  for (const question of ['Is this suitable for real estate virtual tours?', 'Does the converted 360 photo have visible stitching lines?']) {
    const answer = faqs.find(faq => faq.name === question).acceptedAnswer.text;
    assert.ok(html.includes(`<p>${answer}</p>`), 'visible and structured answers must agree');
  }
  assert.doesNotMatch(html, /Poisson|zero visible|Zero Parallax/);
  assert.match(html, /may cause ghosting/);
  assert.match(html, /not a measured property tour/);
});

test('globe guide describes its implemented glow and device screen capture', () => {
  for (const file of ['photo-to-globe/index.html', 'src/components/landing/PhotoToGlobePage.tsx']) {
    const source = read(file);
    assert.match(source, /no dedicated snapshot export/);
    assert.doesNotMatch(source, /Fresnel|Rayleigh|high-resolution perspective snapshot/);
  }
});

test('about page, open-source repository and redirects expose clean crawlable links with valid schema', () => {
  const repoUrl = 'https://github.com/hanshan0228/360-panorama-viewer';
  const aboutHtml = read('public/about/index.html');
  const indexHtml = read('index.html');
  const appTsx = read('src/App.tsx');
  const sitemapXml = read('public/sitemap.xml');
  const redirects = read('public/_redirects');

  assert.ok(sitemapXml.includes('<loc>https://360panoramaviewer.com/about/</loc>'));
  assert.match(redirects, /^\/open-source\/?\s+\/about\/\s+301/m);

  for (const [file, content] of [['src/App.tsx', appTsx], ['index.html', indexHtml], ['public/about/index.html', aboutHtml]]) {
    assert.ok(content.includes('/about/'), `${file}: must link to /about/`);
    assert.ok(content.includes(repoUrl), `${file}: must link to ${repoUrl}`);
    assert.doesNotMatch(content, new RegExp(`href="${repoUrl}"[^>]*\\brel="[^"]*\\bnofollow\\b`), `${file}: github link must not use nofollow`);
  }

  assert.ok(aboutHtml.includes('<link rel="canonical" href="https://360panoramaviewer.com/about/">'));
  for (const internal of ['/', '/360-panorama-viewer/', '/cubemap-generator/', '/skybox-generator/', '/developers/']) {
    assert.ok(aboutHtml.includes(`href="${internal}"`), `about page missing internal link to ${internal}`);
  }

  const jsonLdMatch = aboutHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'public/about/index.html must include JSON-LD');
  const schema = JSON.parse(jsonLdMatch[1]);
  const graph = schema['@graph'] ?? [schema];
  const aboutPage = graph.find(item => item['@type'] === 'AboutPage');
  const sourceCode = graph.find(item => item['@type'] === 'SoftwareSourceCode');
  assert.ok(aboutPage, 'JSON-LD must define AboutPage');
  assert.ok(sourceCode, 'JSON-LD must define SoftwareSourceCode');
  assert.equal(sourceCode.codeRepository, repoUrl);
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
