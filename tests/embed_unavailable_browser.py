"""Run with: python3 tests/embed_unavailable_browser.py (with Vite running)."""
import base64
import sys
import unittest

from viewer_cubemap_browser import BrowserRegression, BASE_URL
from playwright.sync_api import expect


class EmbedUnavailable(BrowserRegression):
    def test_failure_retry_and_language(self):
        self.page.goto(BASE_URL + '/?lang=zh')
        requests = []
        available = [False]
        image = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=')

        def respond(route):
            requests.append(route.request.url)
            if not available[0]:
                route.fulfill(status=404, body='revoked')
            else:
                route.fulfill(status=200, content_type='image/png', body=image)

        self.context.route('**/embed-test-image', respond)
        fixture = self.mount('commercial/EmbedViewer', {'textureUrl': BASE_URL + '/embed-test-image'})
        expect(fixture.get_by_role('alert')).to_contain_text('分享可能已被撤销')
        available[0] = True
        fixture.get_by_role('button', name='重试').click()
        expect(fixture.get_by_role('alert')).to_have_count(0)
        self.page.wait_for_function("document.querySelector('#regression-fixture img')?.naturalWidth > 0")
        expect(fixture.get_by_role('alert')).to_have_count(0)
        self.assertGreaterEqual(len(requests), 2)

    def test_old_failure_does_not_cover_new_image_or_normal_viewer(self):
        self.page.evaluate("""() => {
          const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
          Object.defineProperty(HTMLImageElement.prototype, 'src', {
            configurable: true, get: original.get,
            set(value) {
              if (value.endsWith('/delayed-embed-image')) window.delayedImage = this;
              else original.set.call(this, value);
            }
          });
        }""")
        fixture = self.mount('commercial/EmbedViewer', {'textureUrl': BASE_URL + '/delayed-embed-image'})
        self.page.wait_for_function('window.delayedImage !== undefined')
        self.page.evaluate("window.oldCanvas = document.querySelector('#regression-fixture canvas')")
        self.page.evaluate("fixtureRender({textureUrl: fixtureProps.currentPanoramaUrl})")
        self.page.wait_for_function("document.querySelector('#regression-fixture canvas') !== oldCanvas")
        self.page.evaluate("delayedImage.dispatchEvent(new Event('error'))")
        expect(fixture.get_by_role('alert')).to_have_count(0)
        expect(fixture.locator('canvas')).to_be_visible()
        self.page.evaluate("fixtureRoot.unmount(); document.getElementById('regression-fixture').remove()")
        normal = self.mount('SphereViewer', {'textureUrl': 'data:image/png;base64,bm90YW5pbWFnZQ=='})
        self.page.wait_for_timeout(500)
        expect(normal.get_by_role('alert')).to_have_count(0)
        expect(normal.locator('canvas')).to_be_visible()


if __name__ == '__main__':
    suite = unittest.TestSuite(EmbedUnavailable(name) for name in (
        'test_failure_retry_and_language', 'test_old_failure_does_not_cover_new_image_or_normal_viewer'))
    sys.exit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
