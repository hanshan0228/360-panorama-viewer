import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const graph = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];

test('privacy explains share uploads and access for unlisted links', () => {
  const html = read('public/privacy/index.html');
  assert.match(html, /Creating a share link uploads the image/);
  assert.match(html, /Anyone with a share link can access the shared image, even if it is not listed/);
  assert.doesNotMatch(html, /We do not upload, inspect, or store your local files/);
});

test('privacy describes analytics and browser storage without unsupported restrictions', () => {
  const html = read('public/privacy/index.html');
  assert.match(html, /Google Analytics:[\s\S]*?page views and usage events/i);
  assert.match(html, /registration or login, generation results, and checkout initiation/i);
  assert.match(html, /Google may use cookies and similar technologies/i);
  assert.match(html, /guest account data and certain service or administrative settings/i);
  assert.match(html, /Local storage can remain on your device after you close the browser/i);
  assert.match(html, /session storage for some temporary service data/i);
  assert.doesNotMatch(html, /local storage solely|temporary viewer settings|do not use tracking cookies for third-party advertising/i);
});

test('marketing and structured data describe HDR and credit limits consistently', () => {
  for (const path of ['text-to-panorama-ai/index.html', 'ai-hdri-generator/index.html', '360-image-maker/index.html']) {
    const html = read(path);
    const entities = graph(html);
    const software = entities.find(item => /Application$/.test(item['@type']));
    assert.equal(software.offers, undefined, path);
    assert.doesNotMatch(html, /4 (?:complimentary|credits)|upgraded credit packages|real dynamic range for reflections/i, path);
    assert.match(html, /8-bit[^<.]*?(?:high dynamic range|dynamic range)/i, path);
    const faq = entities.find(item => item['@type'] === 'FAQPage');
    const question = path.startsWith('text-to') ? 'Can the result be used as an HDRI for Blender, Unreal or Unity?'
      : path.startsWith('ai-hdri') ? 'Can I export in Radiance .HDR or EXR format for Blender and Unreal Engine?'
      : 'Can I use generated 360 images commercially in VR games or architecture?';
    const answer = faq.mainEntity.find(item => item.name === question)?.acceptedAnswer.text;
    assert.ok(answer, path);
    assert.ok(html.includes(`<h3>${question}</h3>`) && html.includes(`<p>${answer}</p>`), path);
  }
  assert.match(read('ai-hdri-generator/index.html'), /EXR export is not supported/);
});
