import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as THREE from 'three';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
function load(file, globals = {}, modules = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(file, root), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, Blob, Uint8Array, TextEncoder, console,
    require: name => modules[name] ?? require(name), ...globals });
  return exports;
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Promise remained pending')), 250);
    })]);
  } finally { clearTimeout(timer); }
}

test('XMP canvas export rejects null encoding and asynchronous byte-read errors', async () => {
  const { exportVrReadyJpegBlob } = load('src/utils/xmpInjector.ts');
  await assert.rejects(bounded(exportVrReadyJpegBlob({
    toBlob: callback => queueMicrotask(() => callback(null)),
  })), /JPEG encoding failed/);
  await assert.rejects(bounded(exportVrReadyJpegBlob({
    toBlob: callback => queueMicrotask(() => callback({
      arrayBuffer: async () => { throw new Error('read failed'); },
    })),
  })), /read failed/);
});

test('JPEG tagging preserves all original metadata and encoded scan bytes without canvas encoding', async () => {
  const original = Uint8Array.from([255,216,255,224,0,4,74,70,255,225,0,8,69,120,105,102,0,0,
    255,218,0,2,10,20,255,0,30,255,217]);
  let reads = 0;
  const { exportPhotoSphereFile } = load('src/utils/xmpInjector.ts', {
    Image: class {
      naturalWidth = 4096; naturalHeight = 2048;
      set src(value) { queueMicrotask(() => this.onload()); }
    },
    document: { createElement() { assert.fail('JPEG must not be re-encoded'); } },
  });
  const blob = await exportPhotoSphereFile({ type: 'image/jpeg', name: 'original.jpg',
    async arrayBuffer() { reads++; return original.buffer; } }, 'blob:original');
  const output = new Uint8Array(await blob.arrayBuffer());
  assert.equal(reads, 1);
  assert.deepEqual(output.slice(0, 8), original.slice(0, 8));
  const segmentSize = ((output[10] << 8) | output[11]) + 2;
  assert.deepEqual(output.slice(8 + segmentSize), original.slice(8));
  assert.match(await blob.text(), /FullPanoWidthPixels>4096/);
});

test('retagging replaces standard XMP while preserving EXIF, ICC and encoded scan bytes', async () => {
  const { injectPhotoSphereXmp } = load('src/utils/xmpInjector.ts');
  const original = Uint8Array.from([255,216,
    255,225,0,8,69,120,105,102,0,0,
    255,226,0,6,73,67,67,0,
    255,218,0,2,12,34,255,0,56,255,217]);
  const first = injectPhotoSphereXmp(original.buffer, 16, 8);
  const retagged = injectPhotoSphereXmp(await first.arrayBuffer(), 32, 9);
  const output = new Uint8Array(await retagged.arrayBuffer());
  assert.equal(retagged.size, first.size);
  const segmentSize = ((output[4] << 8) | output[5]) + 2;
  assert.deepEqual(output.slice(2 + segmentSize), original.slice(2));
  const text = await retagged.text();
  assert.equal(text.split('http://ns.adobe.com/xap/1.0/').length - 1, 1);
  assert.match(text, /FullPanoWidthPixels>32/);
  assert.ok(!text.includes('FullPanoWidthPixels>16'));
});

test('PNG conversion and decode/canvas failures settle', async () => {
  let decodeFailure = false;
  let contextAvailable = true;
  const draws = [];
  const { exportPhotoSphereFile } = load('src/utils/xmpInjector.ts', {
    Image: class {
      naturalWidth = 16; naturalHeight = 8;
      set src(value) { queueMicrotask(() => decodeFailure ? this.onerror() : this.onload()); }
    },
    document: { createElement: () => ({ getContext: () => contextAvailable ? {
      drawImage: (...args) => draws.push(args),
    } : null, toBlob: callback => callback(new Blob([Uint8Array.from([255,216,255,217])])) }) },
  });
  assert.ok((await exportPhotoSphereFile({ type: 'image/png' }, 'blob:image')).size > 4);
  assert.equal(draws.length, 1);
  contextAvailable = false;
  await assert.rejects(bounded(exportPhotoSphereFile({ type: 'image/webp' }, 'blob:image')), /Canvas/);
  decodeFailure = true;
  await assert.rejects(bounded(exportPhotoSphereFile({ type: 'image/jpeg' }, 'blob:bad')), /decoding/);
});

for (const failure of ['load', 'setup', 'capture', 'constructor', 'start', 'render', 'progress', 'runtime', 'stop', 'success']) {
  test('video settles and releases resources: ' + failure, async () => {
    const released = { renderer: 0, texture: 0, geometry: 0, material: 0, tracks: 0, timers: 0 };
    const fail = () => { throw new Error(failure); };
    let recorder;
    const texture = new THREE.Texture();
    texture.dispose = () => { released.texture++; };
    const fakeThree = { ...THREE,
      WebGLRenderer: class {
        setSize() { if (failure === 'setup') fail(); }
        setPixelRatio() {}
        render() { if (failure === 'render') fail(); }
        dispose() { released.renderer++; }
      },
      TextureLoader: class {
        load(url, onload, progress, onerror) {
          queueMicrotask(() => failure === 'load' ? onerror(new Error('load')) : onload(texture));
          return texture;
        }
      },
      SphereGeometry: class extends THREE.SphereGeometry {
        dispose() { released.geometry++; super.dispose(); }
      },
      MeshBasicMaterial: class extends THREE.MeshBasicMaterial {
        dispose() { released.material++; super.dispose(); }
      },
    };
    const timers = new Set();
    const { renderPanoramaToVideoBlob } = load('src/utils/videoRecorder.ts', {
      document: { createElement: () => ({ captureStream() {
        if (failure === 'capture') fail();
        return { getTracks: () => [{ stop() { released.tracks++; } }] };
      } }) },
      setInterval(callback) {
        const timer = setInterval(callback, 1);
        timers.add(timer);
        return timer;
      },
      clearInterval(timer) { if (timers.delete(timer)) released.timers++; clearInterval(timer); },
      MediaRecorder: class {
        static isTypeSupported() { return true; }
        state = 'inactive'; mimeType = 'video/webm';
        constructor() { if (failure === 'constructor') fail(); recorder = this; }
        start() {
          if (failure === 'start') fail();
          this.state = 'recording';
          if (failure === 'runtime') queueMicrotask(() => this.onerror({ error: new Error('runtime') }));
        }
        stop() {
          this.state = 'inactive';
          if (failure === 'stop') fail();
          this.ondataavailable?.({ data: new Blob(['video']) });
          this.onstop?.();
        }
      },
    }, { three: fakeThree });
    const promise = renderPanoramaToVideoBlob('blob:texture', {
      durationSeconds: 0.01, fps: 30, width: 16, height: 8,
      onProgress() { if (failure === 'progress') fail(); },
    });
    try {
      if (failure === 'success') assert.equal((await bounded(promise)).size, 5);
      else await assert.rejects(bounded(promise), new RegExp(failure));
      assert.equal(released.renderer, 1);
      if (failure !== 'setup') assert.equal(released.texture, 1);
      if (!['setup', 'load'].includes(failure)) {
        assert.equal(released.geometry, 1);
        assert.equal(released.material, 1);
      }
      if (!['setup', 'load', 'capture'].includes(failure)) assert.equal(released.tracks, 1);
      assert.equal(timers.size, 0);
      if (recorder) assert.equal(recorder.onerror, null);
    } finally { timers.forEach(clearInterval); }
  });
}

function componentHarness(file, exportName, globals, exportFile) {
  const hooks = [];
  let cursor = 0;
  let effects = [];
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, value => { hooks[index].value = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      hooks[index] ??= { value: { current: initial } };
      return hooks[index].value;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))) {
        effects.push(() => { previous?.cleanup?.(); hooks[index] = { dependencies, cleanup: callback() }; });
      }
    },
  };
  const Component = load(file, globals, { react,
    'canvas-confetti': () => {}, '../../utils/xmpInjector': { exportPhotoSphereFile: exportFile },
  })[exportName];
  return {
    render(props) {
      cursor = 0; effects = [];
      const tree = Component(props);
      effects.forEach(effect => effect());
      return tree;
    },
    unmount() { hooks.forEach(hook => hook.cleanup?.()); },
  };
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}
function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  return React.isValidElement(tree) ? textOf(tree.props.children) : typeof tree === 'string' ? tree : '';
}

for (const component of ['Modal', 'Page']) {
  test('metadata ' + component + ' clears failures and ignores replaced/unmounted results and dimensions', async () => {
    const images = [];
    const downloads = [];
    const revoked = [];
    let finish;
    let failExport = true;
    let serial = 0;
    const globals = {
      Image: class { constructor() { images.push(this); } set src(value) {} },
      URL: { createObjectURL: () => 'blob:' + ++serial, revokeObjectURL: url => revoked.push(url) },
      document: { createElement: () => ({ click() { downloads.push(this.download); }, remove() {} }),
        body: { appendChild() {} } },
    };
    const harness = componentHarness(
      'src/components/' + (component === 'Modal' ? 'commercial/MetadataInjectorModal' : 'landing/MetadataInjectorPage') + '.tsx',
      'MetadataInjector' + component, globals,
      async () => {
        if (failExport) throw new Error('decode/encode failure');
        return new Promise(resolve => { finish = resolve; });
      });
    const props = { isOpen: true, onClose() {}, onLaunchStudio() {} };
    const render = () => harness.render(props);
    let tree = render();
    const upload = name => {
      elements(tree).find(element => element.type === 'input' && element.props.type === 'file')
        .props.onChange({ target: { files: [{ name, type: 'image/jpeg' }] } });
      tree = render();
    };
    const action = () => elements(tree).find(element => element.type === 'button'
      && /Inject.*(Download|JPEG)/.test(textOf(element)));
    const reset = () => {
      elements(tree).find(element => element.type === 'button'
        && /Change Image|Choose Another File/.test(textOf(element))).props.onClick();
      tree = render();
    };
    upload('old.jpg');
    const staleLoad = images.at(-1).onload;
    images.at(-1).onerror();
    tree = render();
    assert.ok(elements(tree).some(element => element.props.role === 'alert'));
    await action().props.onClick();
    tree = render();
    assert.equal(action().props.disabled, false);
    assert.ok(elements(tree).some(element => element.props.role === 'alert'));
    failExport = false;
    const pending = action().props.onClick();
    reset();
    upload('new.jpg');
    staleLoad();
    tree = render();
    assert.ok(!textOf(tree).includes('undefined × undefined'));
    images.at(-1).naturalWidth = 100;
    images.at(-1).naturalHeight = 50;
    images.at(-1).onload();
    tree = render();
    assert.match(textOf(tree), /100 × 50/);
    finish(new Blob(['old result']));
    await pending;
    assert.equal(downloads.length, 0);
    const current = action().props.onClick();
    finish(new Blob(['new result']));
    await current;
    assert.deepEqual(downloads, ['new-photosphere-360.jpg']);
    tree = render();
    const unmounted = action().props.onClick();
    harness.unmount();
    finish(new Blob(['late result']));
    await unmounted;
    assert.equal(downloads.length, 1);
    assert.ok(revoked.length >= 2);
  });
}

function initializer(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(new URL(file, root), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.left.getText(source) === name
      && ts.isNewExpression(node.right) && node.right.expression.getText(source) === 'THREE.CylinderGeometry') {
      result = node.right.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result);
  return vm.runInNewContext(result, { THREE });
}

test('curved surface covers both sides of initial +X camera', () => {
  const geometry = initializer('src/components/SphereViewer.tsx', 'geometry');
  geometry.scale(-1, 1, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(75, 800 / 520, 0.1, 2500);
  camera.lookAt(500, 0, 0);
  camera.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  for (const horizontal of [-0.8, 0, 0.8]) {
    raycaster.setFromCamera(new THREE.Vector2(horizontal, 0), camera);
    assert.ok(raycaster.intersectObject(mesh).length > 0);
  }
});

test('auto-fit sharp subject covers sphere initial center and both sides across texture seam', () => {
  const draws = [];
  const context = { save() {}, restore() {}, fillRect() {}, strokeRect() {},
    drawImage: (...args) => draws.push(args), createLinearGradient: () => ({ addColorStop() {} }) };
  const { convertFlatPhotoToEquirectangular } = load('src/utils/imageOptimizer.ts', {
    document: { createElement: () => ({ getContext: () => context }) },
  });
  convertFlatPhotoToEquirectangular({ naturalWidth: 1600, naturalHeight: 900 }, 2048);
  const geometry = new THREE.SphereGeometry(500, 128, 64);
  geometry.scale(-1, 1, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(75, 800 / 520, 0.1, 2500);
  camera.lookAt(500, 0.01, 0.01);
  camera.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  for (const horizontal of [-0.5, 0, 0.5]) {
    raycaster.setFromCamera(new THREE.Vector2(horizontal, 0), camera);
    const hit = raycaster.intersectObject(mesh)[0];
    assert.ok(hit);
    assert.ok(draws.slice(1).some(([, position, , width]) =>
      hit.uv.x >= position / 2048 && hit.uv.x <= (position + width) / 2048));
  }
});
