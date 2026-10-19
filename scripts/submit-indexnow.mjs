const key = '65547a2d5e65ced014e2898e9c7ded7b';
const host = '360panoramaviewer.com';

const urlList = [
  'https://360panoramaviewer.com/',
  'https://360panoramaviewer.com/360-panorama-viewer/',
  'https://360panoramaviewer.com/photo-to-globe/',
  'https://360panoramaviewer.com/cubemap-generator/',
  'https://360panoramaviewer.com/photo-to-360-converter/',
  'https://360panoramaviewer.com/360-product-video-generator/',
  'https://360panoramaviewer.com/hdri-to-cubemap/',
  'https://360panoramaviewer.com/zh/',
  'https://360panoramaviewer.com/zh/360-panorama-viewer/',
  'https://360panoramaviewer.com/zh/photo-to-globe/',
  'https://360panoramaviewer.com/zh/cubemap-generator/',
  'https://360panoramaviewer.com/zh/photo-to-360-converter/',
  'https://360panoramaviewer.com/es/',
  'https://360panoramaviewer.com/es/360-panorama-viewer/',
  'https://360panoramaviewer.com/es/photo-to-globe/',
  'https://360panoramaviewer.com/es/cubemap-generator/',
  'https://360panoramaviewer.com/es/photo-to-360-converter/',
  'https://360panoramaviewer.com/de/',
  'https://360panoramaviewer.com/de/360-panorama-viewer/',
  'https://360panoramaviewer.com/de/photo-to-globe/',
  'https://360panoramaviewer.com/de/cubemap-generator/',
  'https://360panoramaviewer.com/de/photo-to-360-converter/',
  'https://360panoramaviewer.com/ja/',
  'https://360panoramaviewer.com/ja/360-panorama-viewer/',
  'https://360panoramaviewer.com/ja/photo-to-globe/',
  'https://360panoramaviewer.com/ja/cubemap-generator/',
  'https://360panoramaviewer.com/ja/photo-to-360-converter/'
];

const payload = {
  host,
  key,
  keyLocation: `https://${host}/${key}.txt`,
  urlList
};

async function submit() {
  console.log(`Submitting ${urlList.length} URLs to IndexNow (Bing / Yandex / Naver)...`);
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000)
    });
    console.log(`IndexNow response status: ${res.status} (${res.statusText})`);
    if (res.status === 200 || res.status === 202) {
      console.log('Successfully submitted all URLs to IndexNow!');
    } else {
      const text = await res.text();
      console.log('IndexNow response:', text);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('IndexNow submission error:', err);
    process.exitCode = 1;
  }
}

submit();
