"""Run against the production preview; never contacts the AI service.

SKYBOX_BASE_URL=http://127.0.0.1:4173 python3 tests/skybox_example_browser.py
Set PLAYWRIGHT_CHROMIUM_EXECUTABLE if the installed browser cache differs.
"""
import base64
import io
import os
from pathlib import Path
import struct
import unittest
import zipfile

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('SKYBOX_BASE_URL', 'http://127.0.0.1:4173')
ROOT = Path(__file__).resolve().parent.parent
GUIDE = '/blog/panorama-to-skybox-threejs-unity/'
SAMPLE = ROOT / 'public/examples/skybox'


class SkyboxExample(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = sync_playwright().start()
        cls.browser = cls.runtime.chromium.launch(
            headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.runtime.stop()

    def setUp(self):
        self.context = self.browser.new_context()
        self.context.route('**/*', lambda route: route.continue_()
                           if route.request.url.startswith((BASE, 'blob:', 'data:')) else route.abort())
        self.ai_calls = []

        def reject_api(route):
            self.ai_calls.append(route.request.url)
            route.fulfill(status=503, content_type='application/json', body='{"error":"Disabled in example test"}')

        self.context.route('**/api/generate*', reject_api)
        self.context.route('**/api/user/guest*', reject_api)
        self.page = self.context.new_page()

    def tearDown(self):
        self.assertEqual(self.ai_calls, [], 'the guide and free converter must not start an AI trial or generation')
        self.context.close()

    def test_guide_without_javascript_downloads_and_fits_mobile(self):
        context = self.browser.new_context(java_script_enabled=False)
        try:
            page = context.new_page()
            for width in [320, 390, 1440]:
                page.set_viewport_size({'width': width, 'height': 900})
                response = page.goto(BASE + GUIDE)
                self.assertEqual(response.status, 200)
                expect(page.get_by_role('heading', name='Panorama to Skybox: Three.js & Unity', exact=True)).to_be_visible()
                self.assertLessEqual(page.evaluate('document.documentElement.scrollWidth'), width)
                self.assertTrue(page.locator('article img').evaluate('el => el.complete && el.naturalWidth === 2048'))
            for label in ['Download sample PNG', 'Download six-face ZIP']:
                with page.expect_download() as event:
                    page.get_by_role('link', name=label, exact=True).click()
                self.assertIsNone(event.value.failure())
                path = Path(event.value.path())
                if path.read_bytes().startswith(b'\x89PNG'):
                    self.assertEqual(struct.unpack('>II', path.read_bytes()[16:24]), (2048, 1024))
                else:
                    with zipfile.ZipFile(path) as archive:
                        self.assertEqual(len(archive.namelist()), 6)
        finally:
            context.close()

    def test_sample_reproduces_the_downloadable_six_face_output(self):
        self.page.goto(BASE + '/cubemap-generator/?lang=en', wait_until='networkidle')
        self.page.locator('input[type=file]').first.set_input_files(SAMPLE / 'orientation-panorama.png')
        self.page.get_by_role('button', name='512 × 512', exact=True).click()
        download = self.page.get_by_role('button', name='Download All 6 Faces (ZIP)', exact=True)
        expect(download).to_be_enabled(timeout=30000)
        with self.page.expect_download() as event:
            download.click()
        actual = zipfile.ZipFile(io.BytesIO(Path(event.value.path()).read_bytes()))
        expected = zipfile.ZipFile(SAMPLE / 'orientation-cubemap-512.zip')
        names = ['posx.png', 'negx.png', 'posy.png', 'negy.png', 'posz.png', 'negz.png']
        self.assertEqual(set(actual.namelist()), set(names))
        for name in names:
            self.assertEqual(struct.unpack('>II', actual.read(name)[16:24]), (512, 512))
            # Compare decoded pixels, allowing PNG compression to differ between browser versions.
            encoded = [base64.b64encode(archive.read(name)).decode() for archive in [actual, expected]]
            signatures = self.page.evaluate("""async images => Promise.all(images.map(async value => {
                const bytes = Uint8Array.from(atob(value), ch => ch.charCodeAt(0));
                const image = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
                const canvas = document.createElement('canvas');
                canvas.width = image.width; canvas.height = image.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
                const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
                const hash = await crypto.subtle.digest('SHA-256', pixels);
                image.close();
                return Array.from(new Uint8Array(hash)).join(',');
            }))""", encoded)
            self.assertEqual(signatures[0], signatures[1], name)

    def test_threejs_renders_resizes_and_reports_image_load_failure(self):
        errors = []
        self.page.on('pageerror', lambda error: errors.append(str(error)))
        self.page.goto(BASE + '/examples/panorama-skybox/', wait_until='networkidle')
        expect(self.page.get_by_role('status')).to_have_text('Ready — looking toward +Z.')
        canvas = self.page.locator('canvas')
        expect(canvas).to_be_visible()
        before = canvas.screenshot()
        for direction in ['−Z', '+X', '−X', '+Y', '−Y', '+Z']:
            button = self.page.get_by_role('button', name=direction, exact=True)
            button.focus()
            button.press('Enter')
            expect(button).to_have_attribute('aria-pressed', 'true')
            expect(self.page.get_by_role('status')).to_have_text(f'Ready — looking toward {direction}.')
            if direction == '+X':
                self.assertNotEqual(before, canvas.screenshot(), 'changing direction must change the rendered background')
        for width in [320, 390, 1440]:
            self.page.set_viewport_size({'width': width, 'height': 900})
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), width)
        self.assertEqual(errors, [])
        self.context.route('**/orientation-panorama.png', lambda route: route.fulfill(status=404, body='Missing sample'))
        self.page.reload(wait_until='networkidle')
        expect(self.page.get_by_role('status')).to_contain_text('Could not load the example.')


if __name__ == '__main__':
    unittest.main()
