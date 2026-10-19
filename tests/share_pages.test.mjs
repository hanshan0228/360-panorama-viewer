import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSharePageHtml } from '../server/sharePage.mjs';

// The real SPA shell: the builder asserts every anchor it rewrites, so this test fails
// whenever the shipped template drifts away from the patterns in server/sharePage.mjs.
const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const origin = 'https://360panoramaviewer.com';
const id = '0123456789abcdef0123456789abcdef';
const share = { id, title: 'Alpine "Lake" & <Sunrise>', width: 4096, height: 2048, created_at: Date.UTC(2026, 9, 19) };
const url = `${origin}/s/${id}`;
const image = `${origin}/api/shares/${id}/image`;
const html = buildSharePageHtml(shell, share, origin);
const captured = (pattern, source = html) => {
  const match = source.match(pattern);
  assert.ok(match, `expected the page to contain ${pattern}`);
  return match[1];
};

test('listed share pages carry unique, crawlable metadata', () => {
  assert.equal(captured(/<title>([\s\S]*?)<\/title>/), 'Alpine &quot;Lake&quot; &amp; &lt;Sunrise&gt; — 360° Panorama | 360 Panorama Viewer');
  assert.equal(captured(/<link rel="canonical" href="([^"]*)"/), url);
  assert.equal(captured(/<meta name="robots" content="([^"]*)"/), 'index, follow, max-image-preview:large');
  assert.equal(captured(/<meta property="og:url" content="([^"]*)"/), url);
  assert.equal(captured(/<meta property="og:image" content="([^"]*)"/), image);
  assert.equal(captured(/<meta name="twitter:url" content="([^"]*)"/), url);
  assert.equal(captured(/<meta name="twitter:image" content="([^"]*)"/), image);
  // The description is rewritten on all three surfaces (SEO description, og, twitter).
  for (const pattern of [/<meta\s+name="description"\s+content="([^"]*)"/, /<meta\s+property="og:description"\s+content="([^"]*)"/, /<meta\s+name="twitter:description"\s+content="([^"]*)"/]) {
    assert.match(captured(pattern), /Alpine &quot;Lake&quot; &amp; &lt;Sunrise&gt;[\s\S]*4096×2048/);
  }
  assert.ok(!html.includes('<link rel="canonical" href="https://360panoramaviewer.com/" />'), 'the homepage canonical must be replaced');
});

test('listed share pages expose the panorama image and structured data', () => {
  const jsonLd = JSON.parse(captured(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/));
  const [imageObject, breadcrumbs] = jsonLd['@graph'];
  assert.equal(imageObject['@type'], 'ImageObject');
  assert.equal(imageObject.contentUrl, image);
  assert.equal(imageObject.width.value, 4096);
  assert.equal(imageObject.height.value, 2048);
  assert.equal(imageObject.datePublished, '2026-10-19T00:00:00.000Z');
  assert.deepEqual(breadcrumbs.itemListElement.map(item => item.name), ['Home', '360 Panorama Showcase', 'Alpine "Lake" & <Sunrise>']);
  assert.equal(breadcrumbs.itemListElement[2].item, url);
  // Exactly one structured-data block and one no-JS block survive the rewrite.
  assert.equal(html.match(/application\/ld\+json/g).length, 1);
  assert.equal(html.match(/<noscript>/g).length, 1);
});

test('the no-JS fallback shows the panorama and links into the showcase', () => {
  const noscript = captured(/<noscript>([\s\S]*?)<\/noscript>/);
  assert.match(noscript, /<h1>Alpine &quot;Lake&quot; &amp; &lt;Sunrise&gt;<\/h1>/);
  assert.ok(noscript.includes(`<img src="${image}"`));
  assert.ok(noscript.includes('href="/360-panorama-viewer/"'));
  assert.ok(noscript.includes('href="/showcase/"'));
});

test('a missing template anchor throws instead of silently serving homepage metadata', () => {
  const withoutCanonical = shell.replace(/<link rel="canonical"[^>]*>/, '');
  assert.throws(() => buildSharePageHtml(withoutCanonical, share, origin), /canonical/);
  assert.throws(() => buildSharePageHtml(shell.replace(/<noscript>[\s\S]*?<\/noscript>/, ''), share, origin), /noscript/);
});
