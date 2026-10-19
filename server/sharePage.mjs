// Turns the SPA shell into a crawlable, uniquely titled page for publicly listed shares.
// ponytail: string surgery on a shell we own; assert every anchor so a template change fails loudly
// instead of silently serving the homepage meta on a share URL.
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function swap(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`Share page template is missing the ${label} anchor`);
  return html.replace(pattern, replacement);
}

export function buildSharePageHtml(shell, share, origin) {
  const url = `${origin}/s/${share.id}`;
  const image = `${origin}/api/shares/${share.id}/image`;
  const title = escapeHtml(share.title || 'Shared panorama');
  const pageTitle = `${title} — 360° Panorama | 360 Panorama Viewer`;
  const description = escapeHtml(`Interactive 360° panorama "${share.title || 'Shared panorama'}" (${share.width}×${share.height} equirectangular). Drag to look around, open it in VR, and view it free in your browser — no plugin, no upload.`);
  const published = new Date(Number(share.created_at) || Date.now()).toISOString();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ImageObject',
        '@id': `${url}#image`,
        contentUrl: image,
        url,
        name: share.title || 'Shared panorama',
        description: `360° equirectangular panorama shared with 360 Panorama Viewer (${share.width}×${share.height}).`,
        width: { '@type': 'QuantitativeValue', value: Number(share.width) },
        height: { '@type': 'QuantitativeValue', value: Number(share.height) },
        datePublished: published,
        encodingFormat: 'image/png',
        representativeOfPage: true,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumbs`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: '360 Panorama Showcase', item: `${origin}/showcase/` },
          { '@type': 'ListItem', position: 3, name: share.title || 'Shared panorama', item: url },
        ],
      },
    ],
  };
  const noscript = `<noscript>
        <header>
          <h1>${title}</h1>
          <p>360° equirectangular panorama (${Number(share.width)} × ${Number(share.height)}) shared with 360 Panorama Viewer. Drag to look around, or open the full viewer below.</p>
        </header>
        <main>
          <img src="${image}" alt="${title} — full 2:1 equirectangular 360° panorama" />
          <p><a href="/360-panorama-viewer/">Open this panorama in the free 360° panorama viewer</a> — no upload and no plugin, every photo stays in your browser.</p>
          <p><a href="/showcase/">Browse more 360° panorama examples in the community showcase</a></p>
        </main>
      </noscript>`;

  let html = shell;
  html = swap(html, /<title>[\s\S]*?<\/title>/i, `<title>${pageTitle}</title>`, 'title');
  html = swap(html, /<meta name="title" content="[^"]*"\s*\/?>/i, `<meta name="title" content="${pageTitle}" />`, 'meta title');
  html = swap(html, /<meta\s+name="description"\s+content="[^"]*"\s*\/>/i, `<meta\n      name="description"\n      content="${description}"\n    />`, 'meta description');
  html = swap(html, /<meta name="robots" content="[^"]*"\s*\/?>/i, '<meta name="robots" content="index, follow, max-image-preview:large" />', 'meta robots');
  html = swap(html, /<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${url}" />`, 'canonical');
  html = swap(html, /<meta property="og:type" content="[^"]*"\s*\/?>/i, '<meta property="og:type" content="article" />', 'og type');
  html = swap(html, /<meta property="og:url" content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${url}" />`, 'og url');
  html = swap(html, /<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${pageTitle}" />`, 'og title');
  html = swap(html, /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/i, `<meta\n      property="og:description"\n      content="${description}"\n    />`, 'og description');
  html = swap(html, /<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${image}" />`, 'og image');
  html = swap(html, /<meta\s+(?:name|property)="twitter:url"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:url" content="${url}" />`, 'twitter url');
  html = swap(html, /<meta\s+(?:name|property)="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${pageTitle}" />`, 'twitter title');
  html = swap(html, /<meta\s+(?:name|property)="twitter:description"\s+content="[^"]*"\s*\/>/i, `<meta\n      name="twitter:description"\n      content="${description}"\n    />`, 'twitter description');
  html = swap(html, /<meta\s+(?:name|property)="twitter:image"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${image}" />`, 'twitter image');
  // Replace the studio's structured data and no-JS copy so the share URL is not a duplicate of the homepage.
  html = swap(html, /<script type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n    </script>`, 'JSON-LD');
  html = swap(html, /<noscript>[\s\S]*?<\/noscript>/i, noscript, 'noscript');
  return html;
}
