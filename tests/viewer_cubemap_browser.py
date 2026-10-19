"""Isolated browser regression tests; no AI requests or live account use.
Run: py -3.13 tests/viewer_cubemap_browser.py
"""
import re
import os
import base64
import struct
import zipfile
import unittest
from playwright.sync_api import sync_playwright, expect

BASE_URL = "http://localhost:5173"


class BrowserRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = sync_playwright().start()
        cls.browser = cls.runtime.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.runtime.stop()

    def setUp(self):
        self.context = self.browser.new_context()
        self.context.route("**/*", lambda route: route.continue_() if route.request.url.startswith((BASE_URL, "data:", "blob:")) else route.abort())
        self.page = self.context.new_page()
        self.page.goto(BASE_URL)
        self.page.wait_for_function("location.href !== 'about:blank' && document.querySelector('#root')")

    def tearDown(self):
        self.context.close()

    def mount(self, component, props=None):
        self.page.evaluate("""async ({component, props}) => {
          const reactModule = await import('/node_modules/.vite/deps/react.js');
          const React = reactModule.default ?? reactModule;
          const domModule = await import('/node_modules/.vite/deps/react-dom_client.js');
          const { createRoot } = domModule.default ?? domModule;
          const module = await import(`/src/components/${component}.tsx`);
          document.getElementById('root').hidden = true;
          const fixture = document.createElement('div');
          fixture.id = 'regression-fixture';
          fixture.style.cssText = 'width:800px;height:600px;position:relative';
          document.body.append(fixture);
          const canvas = document.createElement('canvas');
          canvas.width = 32; canvas.height = 16;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#cc5533'; ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#3388cc'; ctx.fillRect(16, 0, 16, 16);
          const url = canvas.toDataURL();
          window.fixtureProps = { currentPanoramaUrl: url, textureUrl: url, className: 'w-full h-full', ...props };
          if (component === 'SphereViewer') window.fixtureProps.onAddHotspot = () => {};
          window.fixtureRender = extra => window.fixtureRoot.render(React.createElement(module[component.split('/').pop()], {...window.fixtureProps, ...extra}));
          window.fixtureRoot = createRoot(fixture);
          window.fixtureRender({});
        }""", {"component": component, "props": props or {}})
        return self.page.locator('#regression-fixture')

    def test_hdri_exposure_and_cube_download(self):
        fixture = self.mount('landing/HdriViewerPage')
        header = b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 8 +X 16\n'
        payload = {'name': 'studio.hdr', 'mimeType': 'image/vnd.radiance', 'buffer': header + bytes([128, 64, 32, 128]) * 128}
        fixture.locator('input[type=file]').set_input_files(payload)
        canvas = fixture.locator('canvas')
        expect(canvas).to_have_attribute('width', '16')
        baseline = canvas.evaluate("el => el.getContext('2d').getImageData(0, 0, 1, 1).data[0]")
        self.assertGreater(baseline, 100)
        fixture.get_by_role('slider', name='Exposure in EV').fill('-2')
        self.page.wait_for_function("initial => document.querySelector('#regression-fixture canvas').getContext('2d').getImageData(0, 0, 1, 1).data[0] < initial", arg=baseline)
        fixture.get_by_role('combobox', name='Cube face size').select_option('512')
        fixture.get_by_role('button', name='Slice to 6 cube faces').click()
        expect(fixture.locator('img')).to_have_count(6)
        with self.page.expect_download() as downloaded:
            fixture.get_by_role('button', name='Download all 6 faces (ZIP)').click()
        with zipfile.ZipFile(downloaded.value.path()) as archive:
            self.assertEqual(set(archive.namelist()), {f'{face}.png' for face in ['posx', 'negx', 'posy', 'negy', 'posz', 'negz']})
            for filename in archive.namelist():
                self.assertEqual(struct.unpack('>II', archive.read(filename)[16:24]), (512, 512))
        fixture.get_by_role('combobox', name='Cube face size').select_option('1024')
        expect(fixture.locator('img')).to_have_count(0)

    def test_hdri_rejects_bad_headers_and_gates_non_spherical_images(self):
        fixture = self.mount('landing/HdriViewerPage')
        uploader = fixture.locator('input[type=file]')
        png = self.page.evaluate("""() => {
          const canvas = document.createElement('canvas');
          canvas.width = 3; canvas.height = 2;
          return canvas.toDataURL().split(',')[1];
        }""")
        uploader.set_input_files({'name': 'flat.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(png)})
        expect(fixture.locator('canvas')).to_have_attribute('width', '3')
        expect(fixture.get_by_role('status')).to_contain_text('not 2:1')
        expect(fixture.get_by_role('button', name='Open in 360° viewer')).to_be_disabled()
        expect(fixture.get_by_role('button', name='Slice to 6 cube faces')).to_be_disabled()
        expect(fixture.get_by_role('button', name='Download tone-mapped PNG')).to_be_enabled()
        uploader.set_input_files({'name': 'broken.hdr', 'mimeType': 'image/vnd.radiance', 'buffer': b'not an HDR'})
        expect(fixture.get_by_role('alert')).to_contain_text('standard -Y +X')
        expect(fixture.locator('canvas')).to_have_count(0)
        huge = b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 4096 +X 100000\n'
        uploader.set_input_files({'name': 'oversize.hdr', 'mimeType': 'image/vnd.radiance', 'buffer': huge})
        expect(fixture.get_by_role('alert')).to_contain_text('8192 pixels')
        expect(fixture.locator('canvas')).to_have_count(0)
        self.assertEqual(fixture.get_by_role('slider', name='Exposure in EV').count(), 0)

    def test_generator_external_presets_preserve_local_edits(self) -> None:
        fixture = self.mount('GeneratorTab', {'externalPrompt': 'Original scene', 'externalStyle': 'cyberpunk'})
        prompt = fixture.locator('#prompt-input')
        expect(prompt).to_have_value('Original scene')
        prompt.fill('My edited scene')
        local_style = fixture.get_by_role('button', name=re.compile('Modern Penthouse'))
        local_style.click()
        self.page.evaluate("fixtureRender({externalPrompt:'Original scene', externalStyle:'cyberpunk'})")
        expect(prompt).to_have_value('My edited scene')
        expect(local_style).to_have_class(re.compile(r'(^| )border-cyan-400( |$)'))
        self.page.evaluate("fixtureRender({externalPrompt:'New mountain scene', externalStyle:'nature'})")
        expect(prompt).to_have_value('New mountain scene')
        expect(fixture.get_by_role('button', name=re.compile('Tropical Sunset'))).to_have_class(re.compile(r'(^| )border-cyan-400( |$)'))
        self.page.evaluate("fixtureRender({externalPrompt:'', externalStyle:'nature'})")
        expect(prompt).to_have_value('New mountain scene')

    def test_generator_uncontrolled_input_mode(self) -> None:
        fixture = self.mount('GeneratorTab')
        uploader = fixture.locator('#reference-uploader')
        expect(uploader).to_have_count(0)
        fixture.get_by_role('button', name='Image to Pano', exact=True).click()
        expect(uploader).to_be_visible()
        fixture.get_by_role('button', name='Text Prompt', exact=True).click()
        expect(uploader).to_have_count(0)

    def test_generator_controlled_input_mode(self) -> None:
        fixture = self.mount('GeneratorTab', {'externalInputMode': 'text'})
        self.page.evaluate("""() => {
          window.modeChanges = [];
          window.fixtureProps = {...fixtureProps, onInputModeChange: mode => {
            modeChanges.push(mode);
            window.fixtureProps = {...fixtureProps, externalInputMode: mode};
            fixtureRender({});
          }};
          fixtureRender({});
        }""")
        fixture.get_by_role('button', name='Image to Pano', exact=True).click()
        expect(fixture.locator('#reference-uploader')).to_be_visible()
        self.assertEqual(self.page.evaluate('modeChanges'), ['image'])
        self.page.evaluate("fixtureRender({externalInputMode:'text'})")
        expect(fixture.locator('#reference-uploader')).to_have_count(0)
        self.page.evaluate("fixtureRender({externalInputMode:undefined})")
        expect(fixture.locator('#reference-uploader')).to_have_count(0)
        fixture.get_by_role('button', name='Image to Pano', exact=True).click()
        expect(fixture.locator('#reference-uploader')).to_be_visible()

    def test_sphere_zoom_and_exposure_do_not_recreate_canvas(self) -> None:
        fixture = self.mount('SphereViewer')
        self.page.wait_for_function("document.querySelector('#regression-fixture canvas')?.width > 0")
        self.page.evaluate("window.initialCanvas = document.querySelector('#regression-fixture canvas')")
        fixture.locator('button[title="Tone adjustments, exposure & ambient audio"]').click()
        fixture.locator('input[type="range"][min="0.6"]').fill('0.7')
        fixture.locator('button[title="Zoom in (Narrow FOV)"]').click()
        self.page.evaluate("() => new Promise(resolve => {let n=0; const tick=()=>++n===40?resolve():requestAnimationFrame(tick); requestAnimationFrame(tick);})")
        self.assertTrue(self.page.evaluate("initialCanvas === document.querySelector('#regression-fixture canvas')"))

    def test_sphere_exposure_survives_scene_rebuild(self) -> None:
        fixture = self.mount('SphereViewer')
        self.page.wait_for_function("document.querySelector('#regression-fixture canvas')?.width > 0")
        fixture.locator('button[title="Tone adjustments, exposure & ambient audio"]').click()
        slider = fixture.locator('input[type="range"][min="0.6"]')
        slider.fill('0.6')
        expect(fixture.get_by_text('0.60x', exact=True)).to_be_visible()
        self.page.evaluate("() => new Promise(resolve => {let n=0; const tick=()=>++n===10?resolve():requestAnimationFrame(tick); requestAnimationFrame(tick);})")
        before = fixture.locator('canvas').evaluate('(el) => el.toDataURL()')
        fixture.get_by_role('button', name='180° Curved', exact=True).click()
        fixture.get_by_role('button', name='360° Sphere', exact=True).click()
        self.page.evaluate("() => new Promise(resolve => {let n=0; const tick=()=>++n===10?resolve():requestAnimationFrame(tick); requestAnimationFrame(tick);})")
        expect(slider).to_have_value('0.6')
        self.assertEqual(fixture.locator('canvas').evaluate('(el) => el.toDataURL()'), before)

    def test_cubemap_load_failure_invalidates_previous_results(self):
        fixture = self.mount('CubemapTab')
        download = fixture.get_by_role('button', name='Download All 6 Faces (ZIP)', exact=True)
        expect(download).to_be_enabled(timeout=20000)
        expect(fixture.get_by_role('button', name='Download PNG')).to_have_count(6)
        self.page.evaluate("fixtureRender({currentPanoramaUrl:'data:image/png;base64,bm90YW5pbWFnZQ=='})")
        expect(fixture.get_by_role('alert')).to_be_visible()
        expect(download).to_be_disabled()
        expect(fixture.get_by_role('button', name='Download PNG')).to_have_count(0)

    def test_cubemap_drawing_failure_exits_loading(self):
        fixture = self.mount('CubemapTab')
        download = fixture.get_by_role('button', name='Download All 6 Faces (ZIP)', exact=True)
        expect(download).to_be_enabled(timeout=20000)
        self.page.evaluate("""() => {
          const original = CanvasRenderingContext2D.prototype.drawImage;
          CanvasRenderingContext2D.prototype.drawImage = function(...args) {
            CanvasRenderingContext2D.prototype.drawImage = original;
            throw new Error('mock drawing failure');
          };
          fixtureRender({currentPanoramaUrl:fixtureProps.currentPanoramaUrl + '#next'});
        }""")
        expect(fixture.get_by_role('alert')).to_contain_text('mock drawing failure')
        expect(download).to_be_disabled()
        expect(fixture.get_by_text('Raycasting Slices...', exact=True)).to_have_count(0)

    def test_vr_hotspot_creation_is_explicitly_disabled(self):
        fixture = self.mount('SphereViewer', {'projectionMode': 'vr-cardboard'})
        expect(fixture.locator('button[title="Hotspots are unavailable in VR split-screen and little-planet modes"]')).to_be_disabled()
        expect(fixture.get_by_text('Hotspots are unavailable in VR split-screen mode.', exact=True)).to_be_visible()
        fixture.get_by_role('button', name='360° Sphere', exact=True).click()
        expect(fixture.locator('button[title="Add spatial tour hotspot to 360° scene"]')).to_be_enabled()

    def test_sphere_hotspots_follow_camera(self):
        fixture = self.mount('SphereViewer', {'hotspots': [{'id': 'test-spot', 'lon': 0, 'lat': 0, 'title': 'Test Spot', 'description': ''}]})
        spot = fixture.locator('div.group').filter(has=self.page.get_by_text('Test Spot', exact=True))
        expect(spot).to_be_visible()
        initial = spot.evaluate('(el) => el.style.transform')
        self.page.keyboard.down('ArrowRight')
        self.page.wait_for_function("initial => [...document.querySelectorAll('#regression-fixture div.group')].some(el => el.textContent.includes('Test Spot') && el.style.transform !== initial)", arg=initial)
        self.page.keyboard.up('ArrowRight')
        self.assertNotEqual(spot.evaluate('(el) => el.style.transform'), initial)

    def test_globe_rotation_pause_and_speed(self):
        self.page.evaluate(r"""async () => {
          const source = await (await fetch('/src/components/GlobeViewer.tsx')).text();
          const path = source.match(/from\s+["']([^"']*\/three\.js[^"']*)["']/)[1];
          const THREE = await import(path);
          const original = THREE.Scene.prototype.add;
          window.globeAngles = [];
          THREE.Scene.prototype.add = function(...objects) {
            const globe = objects.find(obj => obj.isMesh && obj.geometry.parameters.radius === 100);
            if (globe) window.fixtureGlobe = globe;
            return original.apply(this, objects);
          };
          function sample() {
            if (window.fixtureGlobe) {
              window.globeAngles.push(window.fixtureGlobe.rotation.y);
              if (window.globeAngles.length > 240) window.globeAngles.shift();
            }
            requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        }""")
        fixture = self.mount('GlobeViewer')
        self.page.wait_for_function('globeAngles.length > 15')
        fixture.locator('button[title="Pause planetary rotation"]').click()
        self.page.evaluate("globeAngles = []")
        self.page.wait_for_function('globeAngles.length > 10')
        paused = self.page.evaluate('globeAngles.slice(-5)')
        self.assertLess(max(paused) - min(paused), 0.000001)
        slider = fixture.locator('input[title="Rotation speed tuning"]')
        slider.fill('0.02')
        fixture.locator('button[title="Start planetary rotation"]').click()
        self.page.evaluate('globeAngles = []')
        self.page.wait_for_function('globeAngles.length > 10')
        self.assertAlmostEqual(self.page.evaluate('globeAngles.at(-1) - globeAngles.at(-2)'), 0.02, places=5)

    def test_sphere_rotation_play_pause(self):
        fixture = self.mount('SphereViewer')
        heading = fixture.locator('span').filter(has_text=re.compile(r'^N · \d+°$')).last
        expect(heading).to_be_visible()
        initial = heading.inner_text()
        fixture.locator('button[title="Start auto-rotation (Spacebar)"]').click()
        self.page.wait_for_function("""initial => [...document.querySelectorAll('#regression-fixture span')].some(el => /^[A-Z]+ · \\d+°$/.test(el.textContent) && el.textContent !== initial)""", arg=initial)
        fixture.locator('button[title="Pause auto-rotation (Spacebar)"]').click()
        self.page.evaluate("() => new Promise(resolve => { let frames=0; const tick=()=>++frames===90?resolve():requestAnimationFrame(tick); requestAnimationFrame(tick); })")
        value = heading.inner_text()
        self.page.evaluate("() => new Promise(resolve => { let frames=0; const tick=()=>++frames===30?resolve():requestAnimationFrame(tick); requestAnimationFrame(tick); })")
        self.assertEqual(heading.inner_text(), value)


if __name__ == '__main__':
    unittest.main(verbosity=2)
