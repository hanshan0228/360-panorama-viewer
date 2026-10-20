"""Isolated browser regression tests; no AI requests or live account use.
Run: py -3.13 tests/viewer_cubemap_browser.py
"""
import re
import os
import base64
import struct
import zipfile
import unittest
import json
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

    def test_free_tools_do_not_request_an_ai_trial(self):
        self.page.goto('about:blank')
        trials = []
        def deny_trial(route):
            trials.append(route.request.url)
            route.fulfill(status=429, content_type='application/json', body='{"error":"Trial unavailable for this network"}')
        self.context.route('**/api/user/guest', deny_trial)
        self.page.goto(BASE_URL + '/360-panorama-viewer/', wait_until='networkidle')
        expect(self.page.locator('h1')).to_contain_text('Panorama Viewer')
        self.assertEqual(trials, [])
        self.page.locator('header').get_by_role('link', name='Studio', exact=True).click()
        expect(self.page.get_by_text('Trial unavailable for this network', exact=True)).to_be_visible()
        self.page.wait_for_load_state('networkidle')
        count = len(trials)
        self.assertGreater(count, 0)
        self.page.locator('header').get_by_role('link', name=re.compile('360° Viewer')).click()
        self.page.wait_for_load_state('networkidle')
        self.assertEqual(len(trials), count)
        expect(self.page.get_by_text('Trial unavailable for this network', exact=True)).to_have_count(0)

    def test_route_links_update_canonicals_and_keep_local_drafts(self):
        self.page.goto(BASE_URL + '/360-panorama-viewer/')
        self.page.get_by_role('link', name='360 Panorama Viewer home', exact=True).click()
        expect(self.page).to_have_url(BASE_URL + '/')
        expect(self.page.locator('link[rel=canonical]')).to_have_attribute('href', 'https://360panoramaviewer.com/')
        expect(self.page.locator('h1')).to_contain_text('Viewer')
        draft = self.page.locator('#prompt-input')
        draft.fill('Keep this local scene description')
        self.page.locator('header').get_by_role('link', name='Studio', exact=True).click()
        expect(self.page).to_have_url(BASE_URL + '/360-image-maker/')
        expect(self.page).to_have_title(re.compile('360 Image Maker'))
        expect(self.page.locator('link[rel=canonical]')).to_have_attribute('href', 'https://360panoramaviewer.com/360-image-maker/')
        expect(draft).to_have_value('Keep this local scene description')
        self.page.get_by_role('link', name='360 Panorama Viewer home', exact=True).click()
        expect(self.page.locator('link[rel=canonical]')).to_have_attribute('href', 'https://360panoramaviewer.com/')
        expect(draft).to_have_value('Keep this local scene description')
        self.page.go_back()
        expect(self.page.locator('link[rel=canonical]')).to_have_attribute('href', 'https://360panoramaviewer.com/360-image-maker/')

    def test_free_viewer_entry_and_file_picker_fit_the_mobile_first_screen(self):
        self.page.set_viewport_size({'width':390,'height':844})
        self.page.goto(BASE_URL + '/')
        entry = self.page.get_by_role('link', name='Open the free 360° viewer')
        expect(entry).to_be_visible()
        box = entry.bounding_box()
        self.assertLessEqual(box['y'] + box['height'], 844)
        self.assertEqual(self.page.locator('canvas').count(), 0)
        entry.click()
        picker = self.page.get_by_label('Open local panorama').locator('..')
        expect(picker).to_be_visible()
        box = picker.bounding_box()
        self.assertGreaterEqual(box['x'], 0)
        self.assertLessEqual(box['x'] + box['width'], 390)
        self.assertLessEqual(box['y'] + box['height'], 844)

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
        style_select = fixture.locator('#environment-style')
        style_select.select_option('interior')
        self.page.evaluate("fixtureRender({externalPrompt:'Original scene', externalStyle:'cyberpunk'})")
        expect(prompt).to_have_value('My edited scene')
        expect(style_select).to_have_value('interior')
        self.page.evaluate("fixtureRender({externalPrompt:'New mountain scene', externalStyle:'nature'})")
        expect(prompt).to_have_value('New mountain scene')
        expect(style_select).to_have_value('nature')
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

    def test_cubemap_navigation_and_reload_keep_the_same_page(self):
        self.page.goto(BASE_URL + '/360-panorama-viewer/')
        self.page.get_by_role('button', name=re.compile('Slice to 6-Face Cubemap')).click()
        expect(self.page).to_have_url(BASE_URL + '/cubemap-generator/')
        expect(self.page.locator('link[rel=canonical]')).to_have_attribute('href', 'https://360panoramaviewer.com/cubemap-generator/')
        expect(self.page.locator('h1')).to_contain_text('Cubemap Generator')
        expect(self.page.get_by_role('button', name=re.compile('Cosmic Nebula'))).to_be_visible()
        self.page.reload()
        expect(self.page.locator('h1')).to_contain_text('Cubemap Generator')
        self.page.goto(BASE_URL + '/#cubemap')
        expect(self.page.locator('link[rel=canonical]')).to_have_attribute('href', 'https://360panoramaviewer.com/cubemap-generator/')
        expect(self.page.locator('h1')).to_contain_text('Cubemap Generator')

    def test_shared_viewing_and_processing_work_without_abort_signal_any(self):
        png = self.page.evaluate("""() => {
          const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 2;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#cc5533'; ctx.fillRect(0, 0, 4, 2);
          return canvas.toDataURL().split(',')[1];
        }""")
        share_id = 'a' * 32
        self.context.route('**/api/shares/' + share_id, lambda route: route.fulfill(json={'share': {'id': share_id, 'title': 'Compatibility panorama', 'width': 4, 'height': 2, 'allowDownload': False}}))
        self.context.route('**/api/shares/' + share_id + '/image', lambda route: route.fulfill(content_type='image/png', body=base64.b64decode(png)))
        errors = []
        self.page.on('pageerror', lambda error: errors.append(str(error)))
        self.page.add_init_script('AbortSignal.any = undefined')
        self.page.goto(BASE_URL + '/s/' + share_id)
        expect(self.page.get_by_role('heading', name='Compatibility panorama', exact=True)).to_be_visible()
        expect(self.page.locator('canvas')).to_be_visible()
        result = self.page.evaluate("""async png => {
          const {processPanoramaImage} = await import('/src/utils/panoramaProcessor.ts');
          return processPanoramaImage('data:image/png;base64,' + png, {preserveNative:true}, false);
        }""", png)
        self.assertTrue(result.startswith('data:image/png;base64,'))
        self.assertEqual(errors, [])

    def test_snapshot_download_includes_contrast_and_saturation(self):
        fixture = self.mount('SphereViewer')
        self.page.wait_for_function("document.querySelector('#regression-fixture canvas')?.width > 0")
        fixture.locator('button[title="Tone adjustments, exposure & ambient audio"]').click()
        fixture.locator('input[type=range]').nth(1).fill('150')
        fixture.locator('input[type=range]').nth(2).fill('70')
        self.page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        original = fixture.locator('canvas').evaluate('(el) => el.toDataURL()')
        with self.page.expect_download() as download:
            fixture.locator('button[title="Capture high-resolution viewport snapshot (PNG)"]').click()
        with open(download.value.path(), 'rb') as file:
            exported = file.read()
        self.assertNotEqual(exported, base64.b64decode(original.split(',')[1]))
        self.assertEqual(struct.unpack('>II', exported[16:24]), tuple(fixture.locator('canvas').evaluate('(el) => [el.width, el.height]')))
        pixels = self.page.evaluate("""async encoded => {
          const source = document.querySelector('#regression-fixture canvas');
          const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
          const ctx = canvas.getContext('2d'); const x = Math.floor(canvas.width/2), y = Math.floor(canvas.height/2);
          ctx.drawImage(source,0,0); const original = [...ctx.getImageData(x,y,1,1).data];
          ctx.filter = 'contrast(150%) saturate(70%)'; ctx.drawImage(source,0,0);
          const expected = [...ctx.getImageData(x,y,1,1).data];
          const image = new Image(); image.src = 'data:image/png;base64,' + encoded; await image.decode();
          ctx.filter = 'none'; ctx.drawImage(image,0,0);
          return {original,expected,actual:[...ctx.getImageData(x,y,1,1).data]};
        }""", base64.b64encode(exported).decode())
        self.assertNotEqual(pixels['original'], pixels['actual'])
        for actual, expected in zip(pixels['actual'], pixels['expected']):
            self.assertLessEqual(abs(actual - expected), 2)

    def test_cooperative_cubemap_conversion_accepts_cancellation_between_batches(self):
        result = self.page.evaluate("""async () => {
          const {sliceEquirectangularToCubemapAsync} = await import('/src/utils/cubemapSlicer.ts');
          const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
          const controller = new AbortController(); let timerRan = false;
          setTimeout(() => { timerRan = true; controller.abort(); }, 0);
          try { await sliceEquirectangularToCubemapAsync(canvas, 1024, controller.signal); return {cancelled:false}; }
          catch (error) { return {cancelled: error.name === 'AbortError', timerRan}; }
        }""")
        self.assertEqual(result, {'cancelled': True, 'timerRan': True})

    def test_cubemap_stitch_rejects_a_replaced_output_size(self):
        fixture = self.mount('landing/CubemapToEquirectPage')
        png = self.page.evaluate("""() => {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#118844'; ctx.fillRect(0,0,16,16);
          return canvas.toDataURL().split(',')[1];
        }""")
        fixture.locator('input[type=file]').first.set_input_files({'name':'posx.png','mimeType':'image/png','buffer':base64.b64decode(png)})
        expect(fixture.get_by_role('img', name='Right cube face preview')).to_be_visible()
        fixture.get_by_role('button', name='4096 × 2048', exact=True).click()
        fixture.get_by_role('button', name='Stitch to 2:1 Panorama', exact=True).click()
        expect(fixture.get_by_role('button', name='Stitching panorama...', exact=True)).to_be_disabled()
        fixture.get_by_role('button', name='1024 × 512', exact=True).click()
        start = fixture.get_by_role('button', name='Stitch to 2:1 Panorama', exact=True)
        expect(start).to_be_enabled()
        start.click()
        result = fixture.get_by_role('img', name='Stitched equirectangular 360 panorama preview')
        expect(result).to_be_visible()
        self.assertEqual(result.evaluate('(el) => [el.naturalWidth, el.naturalHeight]'), [1024,512])
        expect(start).to_be_enabled()

    def test_cubemap_samples_update_source_faces_and_zip(self):
        self.page.goto(BASE_URL + '/cubemap-generator/')
        expect(self.page.locator('h1')).to_have_count(1)
        source = self.page.get_by_role('img', name='Source equirectangular panorama used for the six cube faces below')
        download = self.page.get_by_role('button', name='Download All 6 Faces (ZIP)', exact=True)
        first = self.page.get_by_role('button', name=re.compile('Cosmic Nebula'))
        first.click()
        expect(first).to_have_attribute('aria-pressed', 'true')
        expect(download).to_be_enabled(timeout=20000)
        source_before = source.get_attribute('src')
        face = self.page.get_by_role('img', name='Front (+Z)', exact=True).first
        face_before = face.get_attribute('src')
        second = self.page.get_by_role('button', name=re.compile('Tropical Sunset'))
        second.click()
        expect(second).to_have_attribute('aria-pressed', 'true')
        expect(first).to_have_attribute('aria-pressed', 'false')
        expect(source).not_to_have_attribute('src', source_before)
        expect(download).to_be_enabled(timeout=20000)
        expect(face).not_to_have_attribute('src', face_before)
        self.page.get_by_role('button', name='256 × 256', exact=True).click()
        expect(download).to_be_enabled(timeout=20000)
        with self.page.expect_download() as event:
            download.click()
        with zipfile.ZipFile(event.value.path()) as archive:
            self.assertEqual(set(archive.namelist()), {'posx.png', 'negx.png', 'posy.png', 'negy.png', 'posz.png', 'negz.png'})
            for filename in archive.namelist():
                self.assertEqual(struct.unpack('>II', archive.read(filename)[16:24]), (256, 256))
        png = self.page.evaluate("""() => {
          const canvas = document.createElement('canvas');
          canvas.width = 32; canvas.height = 16;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#118844'; ctx.fillRect(0, 0, 32, 16);
          return canvas.toDataURL().split(',')[1];
        }""")
        self.page.locator('input[type=file]').set_input_files({'name': 'local.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(png)})
        expect(source).to_have_attribute('src', 'data:image/png;base64,' + png)
        expect(second).to_have_attribute('aria-pressed', 'false')
        expect(download).to_be_enabled(timeout=20000)
        faq = self.page.get_by_role('button', name='What face resolutions are supported for ZIP download?', exact=True)
        faq.focus()
        self.page.keyboard.press('Enter')
        expect(faq).to_have_attribute('aria-expanded', 'true')
        expect(self.page.locator('#' + faq.get_attribute('aria-controls'))).to_contain_text('1024x1024')

    def test_cubemap_fallback_contains_guides_and_matches_faq_schema(self):
        context = self.browser.new_context(java_script_enabled=False)
        try:
            page = context.new_page()
            page.goto(BASE_URL + '/cubemap-generator/')
            expect(page.get_by_role('heading', name='Fix seams, rotated faces and blurry cubemaps')).to_be_visible()
            expect(page.get_by_role('heading', name='Unreal Engine: retain the original HDR environment')).to_be_visible()
            graph = json.loads(page.locator('script[type="application/ld+json"]').text_content())['@graph']
            software = next(item for item in graph if item['@type'] == 'SoftwareApplication')
            self.assertNotIn('aggregateRating', software)
            faqs = next(item for item in graph if item['@type'] == 'FAQPage')['mainEntity']
            for faq in faqs:
                expect(page.get_by_role('heading', name=faq['name'], exact=True)).to_be_visible()
                expect(page.get_by_text(faq['acceptedAnswer']['text'], exact=True)).to_be_visible()
            page_text = page.locator('main').inner_text()
            self.assertNotIn('4096px per square face', page_text)
            self.assertIn('256, 512 or 1024 px per face', page_text)
        finally:
            context.close()

    def test_language_guides_keep_their_language_and_reach_the_matching_tool(self):
        for lang in ['zh', 'es', 'de', 'ja']:
            for slug in ['', '360-panorama-viewer', 'photo-to-globe', 'cubemap-generator', 'photo-to-360-converter']:
                route = '/' + lang + '/' + (slug + '/' if slug else '')
                with self.subTest(route=route):
                    response = self.page.goto(BASE_URL + route)
                    self.assertEqual(response.status, 200)
                    expect(self.page.locator('html')).to_have_attribute('lang', lang)
                    expect(self.page.locator('h1')).to_have_count(1)
                    expect(self.page.locator('link[rel=canonical]')).to_have_attribute('href', 'https://360panoramaviewer.com' + route)
                    expect(self.page.locator('nav [aria-current=page]')).to_have_attribute('hreflang', lang)
                    tool_path = '/' + (slug + '/' if slug else '')
                    expect(self.page.locator('a.button')).to_have_attribute('href', tool_path)
                    self.page.wait_for_load_state('networkidle')
                    expect(self.page.locator('html')).to_have_attribute('lang', lang)
                    self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        self.page.goto(BASE_URL + '/cubemap-generator/')
        guides = self.page.get_by_role('navigation', name='Language guides')
        guides.get_by_role('link', name='简体中文', exact=True).click()
        expect(self.page).to_have_url(BASE_URL + '/zh/cubemap-generator/')
        self.page.get_by_role('link', name='日本語', exact=True).click()
        expect(self.page).to_have_url(BASE_URL + '/ja/cubemap-generator/')
        self.page.locator('a.button').click()
        expect(self.page).to_have_url(BASE_URL + '/cubemap-generator/')
        expect(self.page.locator('html')).to_have_attribute('lang', 'en')
        expect(self.page.locator('h1')).to_contain_text('Cubemap Generator')

    def test_hash_tools_link_to_the_matching_language_guide(self):
        for tab, tool_path in [('cubemap', '/cubemap-generator/'), ('viewer', '/360-panorama-viewer/'), ('globe', '/photo-to-globe/')]:
            with self.subTest(tab=tab):
                self.page.goto(BASE_URL + '/#' + tab)
                self.page.wait_for_load_state('networkidle')
                guides = self.page.get_by_role('navigation', name='Language guides')
                expect(guides.get_by_role('link', name='简体中文', exact=True)).to_have_attribute('href', '/zh' + tool_path)
                expect(self.page.get_by_role('heading', level=1)).to_have_count(1)
                guides.get_by_role('link', name='简体中文', exact=True).click()
                expect(self.page).to_have_url(BASE_URL + '/zh' + tool_path)
                self.page.locator('a.button').click()
                expect(self.page).to_have_url(BASE_URL + tool_path)
                expect(self.page.get_by_role('heading', level=1)).to_have_count(1)
        self.page.goto(BASE_URL + '/#pricing')
        expect(self.page.get_by_role('navigation', name='Language guides')).to_have_count(0)

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
        fixture.hover()
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

    def test_globe_zoom_is_bounded_and_survives_wireframe_change(self):
        self.page.evaluate(r"""async () => {
          const source = await (await fetch('/src/components/GlobeViewer.tsx')).text();
          const path = source.match(/from\s+["']([^"']*\/three\.js[^"']*)["']/)[1];
          const THREE = await import(path); const original = THREE.PerspectiveCamera.prototype.updateProjectionMatrix;
          THREE.PerspectiveCamera.prototype.updateProjectionMatrix = function() {
            if (this.fov === 45 && this.far === 1000) window.globeCamera = this;
            return original.call(this);
          };
        }""")
        fixture = self.mount('GlobeViewer')
        self.page.wait_for_function('window.globeCamera?.position.z === 320')
        fixture.get_by_role('button', name='Zoom in on globe').click()
        self.page.wait_for_function('globeCamera.position.z < 320')
        fixture.locator('canvas').dispatch_event('wheel', {'deltaY': -10000, 'deltaMode': 0})
        self.page.wait_for_function('globeCamera.position.z === 150')
        fixture.get_by_role('button', name='Wireframe', exact=True).click()
        expect(fixture.get_by_role('button', name='Solid Surface', exact=True)).to_be_visible()
        self.page.wait_for_function('globeCamera.position.z === 150')
        for _ in range(3):
            fixture.locator('canvas').dispatch_event('wheel', {'deltaY': 10000, 'deltaMode': 1})
        self.page.wait_for_function('globeCamera.position.z === 650')
        self.page.set_viewport_size({'width':390,'height':844})
        fixture.evaluate("el => {el.style.width = '360px';}")
        for control in fixture.locator('button').all():
            box = control.bounding_box()
            self.assertGreaterEqual(box['x'], 0)
            self.assertLessEqual(box['x'] + box['width'], 390)

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
