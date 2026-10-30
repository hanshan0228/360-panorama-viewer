// Local experiment: keeps image-edit credentials in Node and never changes the app or account ledger.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { chromium } from 'playwright';

const { values } = parseArgs({ options: {
  input: { type: 'string' }, output: { type: 'string' }, edited: { type: 'string' },
  model: { type: 'string', default: 'gpt-image-2.5' },
  'base-url': { type: 'string', default: 'http://127.0.0.1:8317/v1' },
  'crop-width': { type: 'string' },
  'proxy-config': { type: 'string' }, 'prepare-only': { type: 'boolean', default: false },
} });
if (!values.input || !values.output) throw Error('Usage: node scripts/try-seam-inpaint.mjs --input image.png --output trial-directory [--proxy-config config.yaml | PANORAMA_EDIT_API_KEY] [--edited previous-output.png | --prepare-only]');
const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(values.output);
fs.mkdirSync(output, { recursive: true });
const dataUrl = file => `data:image/${/\.jpe?g$/i.test(file) ? 'jpeg' : /\.webp$/i.test(file) ? 'webp' : 'png'};base64,${fs.readFileSync(file).toString('base64')}`;
const savePng = (name, url) => fs.writeFileSync(path.join(output, name), Buffer.from(url.split(',')[1], 'base64'));
const moduleSource = file => ts.transpileModule(fs.readFileSync(path.join(root, 'src/utils', file), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
}).outputText;
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PANORAMA_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const context = await browser.newContext();
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  const prepared = await page.evaluate(async ({ imageUrl, helper, healer, cropWidth }) => {
    const loadModule = source => import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    const seam = await loadModule(helper);
    const oldSeam = await loadModule(healer);
    const image = new Image(); image.src = imageUrl; await image.decode();
    const width = Math.floor(Math.min(image.naturalWidth, image.naturalHeight * 2) / 2) * 2;
    const height = width / 2;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, Math.floor((image.naturalWidth - width) / 2), Math.floor((image.naturalHeight - height) / 2), width, height, 0, 0, width, height);
    const original = ctx.getImageData(0, 0, width, height);
    const toCanvas = pixels => {
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.data), width, height), 0, 0); return c;
    };
    const rolled = seam.rollPanoramaPixels(original);
    const mask = seam.createSeamInpaintMask(width, height);
    const editWidth = cropWidth === undefined ? width : Number(cropWidth);
    if (!Number.isSafeInteger(editWidth) || editWidth > width || editWidth < Math.round(width * 0.15625) + 2) throw Error('Crop width must include the seam band and surrounding context');
    const cropLeft = Math.floor((width - editWidth) / 2);
    const crop = pixels => {
      const c = document.createElement('canvas'); c.width = editWidth; c.height = height;
      c.getContext('2d').drawImage(toCanvas(pixels), cropLeft, 0, editWidth, height, 0, 0, editWidth, height);
      return c.toDataURL('image/png');
    };
    const oldCanvas = oldSeam.healPanoramaSeam(canvas, 160, undefined, true);
    globalThis.seamTrial = { seam, oldSeam, original, rolled, mask, canvas, oldCanvas, toCanvas, width, height, editWidth, cropLeft };
    return { width, height, editWidth, sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight,
      original: canvas.toDataURL('image/png'), rolled: toCanvas(rolled).toDataURL('image/png'),
      editInput: crop(rolled), mask: crop(mask), old: oldCanvas.toDataURL('image/png') };
  }, { imageUrl: dataUrl(values.input), helper: moduleSource('seamInpaint.ts'), healer: moduleSource('seamHealer.ts'), cropWidth: values['crop-width'] });
  for (const [key, name] of Object.entries({ original: 'original.png', rolled: 'rolled-input.png', editInput: 'edit-input.png', mask: 'edit-mask.png', old: 'old-blending.png' })) savePng(name, prepared[key]);
  const metadata = { input: path.resolve(values.input), model: values.model,
    sourceWidth: prepared.sourceWidth, sourceHeight: prepared.sourceHeight, width: prepared.width, height: prepared.height,
    editInputWidth: prepared.editWidth, editInputHeight: prepared.height,
    method: 'half-width roll, masked edit, original-pixel composite, inverse roll', actualModelCall: false };
  if (values['prepare-only']) {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(metadata, null, 2));
    console.log(JSON.stringify({ output, ...metadata }));
  } else {
    let editedUrl;
    if (values.edited) editedUrl = dataUrl(values.edited);
    else {
      let apiKey = process.env.PANORAMA_EDIT_API_KEY;
      if (!apiKey && values['proxy-config']) {
        // ponytail: reads the local proxy's simple api-keys YAML list; use the environment for other YAML layouts.
        const config = fs.readFileSync(values['proxy-config'], 'utf8');
        apiKey = config.match(/(?:^|\n)[ \t]*api-keys:[ \t]*\n((?:[ \t]+[^\n]*\n?)*)/)?.[1]
          .match(/^\s*-\s*(.+?)\s*$/m)?.[1]?.replace(/^['"]|['"]$/g, '');
      }
      if (!apiKey) throw Error('Set PANORAMA_EDIT_API_KEY or pass --proxy-config; no model call was made.');
      const endpoint = new URL(values['base-url'].replace(/\/+$/, '') + '/images/edits');
      if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('Invalid image-edit base URL');
      const prompt = `This is a crop around the wrap seam of a 360-degree equirectangular panorama. The seam to repair is the central vertical line. Reconstruct ONLY the narrow transparent-masked central band into a coherent continuation of the scene on both sides. Connect actual objects, horizon, palm leaves, sand and cloud textures with sharp natural detail and matching lighting. Preserve the EXACT positions of every existing tree trunk and leaf outside the mask, camera, composition, geometry, colors and image boundaries. Do not blur, smear, mirror or crossfade mismatched objects. Return exactly ${prepared.editWidth} by ${prepared.height} pixels, without cropping or rescaling.`;
      const form = new FormData();
      form.set('model', values.model); form.set('prompt', prompt); form.set('n', '1');
      form.set('size', `${prepared.editWidth}x${prepared.height}`); form.set('quality', 'high'); form.set('input_fidelity', 'high');
      for (const [name, url] of [['image', prepared.editInput], ['mask', prepared.mask]]) form.set(name,
        new Blob([Buffer.from(url.split(',')[1], 'base64')], { type: 'image/png' }), `${name}.png`);
      const started = Date.now(); console.log(`Editing one panorama with ${values.model} (${prepared.editWidth}x${prepared.height})…`);
      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(240000) });
      const result = await response.json();
      if (!response.ok) throw Error(`Image edit failed (${response.status}): ${result.error?.message || 'upstream failure'}`);
      const item = result.data?.[0];
      if (item?.b64_json) editedUrl = item.b64_json.startsWith('data:') ? item.b64_json : `data:image/png;base64,${item.b64_json}`;
      else if (item?.url) {
        const url = new URL(item.url);
        if (!['https:', 'http:'].includes(url.protocol)) throw Error('Invalid edited image URL');
        const image = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!image.ok) throw Error(`Edited image download failed (${image.status})`);
        editedUrl = `data:image/png;base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;
      }
      if (!editedUrl) throw Error('The image-edit response did not contain an image.');
      metadata.actualModelCall = true; metadata.elapsedSeconds = Number(((Date.now() - started) / 1000).toFixed(1));
      metadata.prompt = prompt; savePng('model-edit.png', editedUrl);
    }
    const finished = await page.evaluate(async editedUrl => {
      const t = globalThis.seamTrial;
      const image = new Image(); image.src = editedUrl; await image.decode();
      if (Math.abs(image.naturalWidth / image.naturalHeight - t.editWidth / t.height) > 0.01) throw Error(`Edited image changed aspect ratio: ${image.naturalWidth}x${image.naturalHeight}`);
      const canvas = document.createElement('canvas'); canvas.width = t.width; canvas.height = t.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.putImageData(new ImageData(t.rolled.data, t.width, t.height), 0, 0);
      ctx.drawImage(image, t.cropLeft, 0, t.editWidth, t.height);
      const edited = ctx.getImageData(0, 0, t.width, t.height);
      const result = t.seam.compositeSeamInpaint(t.original, edited);
      const rolledResult = t.seam.rollPanoramaPixels(result);
      const finalCanvas = t.toCanvas(result);
      const seamStats = pixels => t.oldSeam.inspectPanoramaSeam(pixels.data, t.width, t.height);
      let changedColumns = 0, outsideChangedPixels = 0, nonOpaquePixels = 0, originalNonOpaquePixels = 0;
      for (let x = 0; x < t.width; x++) {
        let changed = false;
        for (let y = 0; y < t.height; y++) {
          const i = (y * t.width + x) * 4;
          if (result.data[i + 3] !== 255) nonOpaquePixels++;
          if (t.original.data[i + 3] !== 255) originalNonOpaquePixels++;
          for (let c = 0; c < 4; c++) if (t.original.data[i + c] !== result.data[i + c]) { changed = true; break; }
          if (t.mask.data[i + 3] === 255) for (let c = 0; c < 4; c++) {
            if (t.rolled.data[i + c] !== rolledResult.data[i + c]) { outsideChangedPixels++; break; }
          }
        }
        if (changed) changedColumns++;
      }
      const sheet = document.createElement('canvas'); sheet.width = 960; sheet.height = 3 * 380;
      const sc = sheet.getContext('2d'); sc.fillStyle = '#0b1115'; sc.fillRect(0, 0, sheet.width, sheet.height);
      const cropW = Math.min(720, t.width), cropH = Math.min(320, t.height);
      const panels = [
        ['Original wrap seam (centered)', t.toCanvas(t.rolled)],
        ['Current edge blending', t.toCanvas(t.seam.rollPanoramaPixels(t.oldCanvas.getContext('2d').getImageData(0, 0, t.width, t.height)))],
        ['AI seam edit + original pixels outside band', t.toCanvas(rolledResult)],
      ];
      panels.forEach(([label, c], index) => {
        const y = index * 380; sc.fillStyle = '#e8eff0'; sc.font = '20px sans-serif'; sc.fillText(label, 24, y + 30);
        sc.drawImage(c, Math.floor((t.width - cropW) / 2), Math.floor((t.height - cropH) / 2), cropW, cropH, 24, y + 48, cropW, cropH);
      });
      return { result: finalCanvas.toDataURL('image/png'), comparison: sheet.toDataURL('image/png'),
        editedWidth: image.naturalWidth, editedHeight: image.naturalHeight, changedColumns, outsideChangedPixels, nonOpaquePixels, originalNonOpaquePixels,
        originalSeam: seamStats(t.original), editedSeam: seamStats(result),
        oldSeam: seamStats(t.oldCanvas.getContext('2d').getImageData(0, 0, t.width, t.height)) };
    }, editedUrl);
    savePng('repaired.png', finished.result); savePng('comparison.png', finished.comparison);
    const { result: _result, comparison: _comparison, ...metrics } = finished;
    if (metrics.outsideChangedPixels) throw Error('Pixels outside the seam repair band changed');
    if (!metrics.originalNonOpaquePixels && metrics.nonOpaquePixels) throw Error('The edit introduced transparency into an opaque panorama');
    Object.assign(metadata, metrics);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(metadata, null, 2));
    console.log(JSON.stringify({ output, ...metrics, elapsedSeconds: metadata.elapsedSeconds }));
  }
} finally { await browser.close(); }
