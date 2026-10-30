"""Run with Vite on port 5173: python3 tests/my_works_browser.py"""
import os
import unittest
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('PANORAMA_BASE_URL', 'http://127.0.0.1:5173')

class MyWorksBrowser(unittest.TestCase):
    def test_library_retry_search_and_share_prompt(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))
            context = browser.new_context(viewport={'width': 320, 'height': 700})
            page = context.new_page()
            page.goto(BASE)
            requests = []
            works = [{'id': 'a' * 32, 'prompt': 'Old forest', 'model': 'model-a', 'width': 2048, 'height': 1024, 'mime': 'image/png', 'created_at': 1700000000000}]
            def respond(route):
                requests.append(route.request.url)
                if len(requests) == 1:
                    route.fulfill(status=503, json={'error': 'Could not load your works.'})
                elif route.request.url.endswith('/thumbnail'):
                    route.fulfill(status=503, json={'error': 'unavailable'})
                elif route.request.url.endswith('/original'):
                    route.fulfill(json={'imageUrl': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII='})
                else:
                    route.fulfill(json={'works': works})
            context.route('**/api/works**', respond)
            page.evaluate("""async () => {
              localStorage.setItem('panorama_server_user_token', 'test-token');
              const {default: React} = await import('/node_modules/.vite/deps/react.js');
              const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
              const {createRoot} = dom.default ?? dom;
              const {MyWorks} = await import('/src/components/commercial/MyWorks.tsx');
              const host = document.createElement('div'); document.body.appendChild(host);
              const root = createRoot(host);
              window.renderWorks = (isOpen, accountId) => root.render(React.createElement(MyWorks, {isOpen, accountId, onClose() {}, onOpen: async (image, share, signal, prompt) => { window.result = {image, share, prompt, aborted: signal.aborted}; }}));
              window.renderWorks(true, 'test');
            }""")
            dialog = page.get_by_role('dialog')
            expect(dialog.get_by_role('alert')).to_be_visible()
            dialog.get_by_role('button', name='Try again').click()
            expect(dialog.get_by_text('Old forest')).to_be_visible()
            assert len(requests) == 2 and all(not url.endswith('/original') for url in requests)
            assert dialog.evaluate('(el) => el.scrollWidth <= el.clientWidth')
            dialog.get_by_label('Search creations').fill('no match')
            expect(dialog.get_by_text('No creations match your search.')).to_be_visible()
            dialog.get_by_label('Search creations').fill('forest')
            dialog.get_by_role('button', name='Load preview').click()
            expect(dialog.get_by_role('img', name='Panorama preview')).to_be_visible()
            page.wait_for_timeout(300)
            assert sum(url.endswith('/original') for url in requests) == 1
            assert sum(url.endswith('/thumbnail') for url in requests) == 1
            page.evaluate("window.renderWorks(false, 'test')")
            expect(page.get_by_role('img', name='Panorama preview')).to_have_count(0)
            page.evaluate("window.renderWorks(true, 'test')")
            expect(dialog.get_by_text('Old forest')).to_be_visible()
            expect(dialog.get_by_role('img', name='Panorama preview')).to_have_count(0)
            dialog.get_by_role('button', name='Load preview').click()
            expect(dialog.get_by_role('img', name='Panorama preview')).to_be_visible()
            page.evaluate("localStorage.setItem('panorama_server_user_token', 'other-token'); window.renderWorks(true, 'other')")
            expect(dialog.get_by_role('img', name='Panorama preview')).to_have_count(0)
            expect(dialog.get_by_text('Old forest')).to_be_visible()
            dialog.get_by_role('button', name='Load preview').click()
            expect(dialog.get_by_role('img', name='Panorama preview')).to_be_visible()
            dialog.get_by_role('button', name='Hide preview').click()
            expect(dialog.get_by_role('img', name='Panorama preview')).to_have_count(0)
            dialog.get_by_role('button', name='Share', exact=True).click()
            page.wait_for_function('window.result !== undefined')
            result = page.evaluate('window.result')
            assert result['prompt'] == 'Old forest' and result['share'] and not result['aborted']
            assert requests[-1].endswith('/thumbnail')
            browser.close()


    def test_thumbnail_upload_survives_close_and_cancels_on_account_change(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))
            page = browser.new_page()
            page.goto(BASE)
            posts = []
            work = {'id': 'a' * 32, 'prompt': 'Old work', 'model': 'model', 'width': 2, 'height': 1, 'mime': 'image/png', 'created_at': 1700000000000, 'thumbnail': None}
            def respond(route):
                if route.request.url.endswith('/thumbnail'):
                    posts.append(route.request.headers['authorization'])
                    work['thumbnail'] = route.request.post_data_json['thumbnail']
                    route.fulfill(json={'success': True})
                elif route.request.url.endswith('/original'):
                    route.fulfill(json={'imageUrl': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII='})
                else:
                    route.fulfill(json={'works': [work]})
            page.route('**/api/works**', respond)
            page.evaluate("""async () => {
              localStorage.setItem('panorama_server_user_token', 'owner-token');
              const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onload');
              Object.defineProperty(HTMLImageElement.prototype, 'onload', {
                configurable: true, get: original.get,
                set(callback) { original.set.call(this, callback ? event => setTimeout(() => callback.call(this, event), 400) : null); }
              });
              const {default: React} = await import('/node_modules/.vite/deps/react.js');
              const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
              const {MyWorks} = await import('/src/components/commercial/MyWorks.tsx');
              const host = document.createElement('div'); document.body.appendChild(host);
              const root = (dom.default ?? dom).createRoot(host);
              window.renderWorks = (isOpen, accountId) => root.render(React.createElement(MyWorks, {
                isOpen, accountId, onClose: () => window.renderWorks(false, accountId),
                onOpen: async (image, share) => { window.opened = share ? 'share' : 'open'; }
              }));
              window.renderWorks(true, 'owner');
            }""")
            for action in ['Open panorama', 'Share']:
                work['thumbnail'] = None
                page.evaluate("window.opened = null; window.renderWorks(true, 'owner')")
                dialog = page.get_by_role('dialog')
                expect(dialog.get_by_text('Old work')).to_be_visible()
                before = len(posts)
                dialog.get_by_role('button', name=action, exact=True).click()
                expect(dialog).to_be_hidden()
                assert page.evaluate('window.opened') == ('share' if action == 'Share' else 'open')
                page.wait_for_timeout(700)
                assert len(posts) == before + 1 and posts[-1] == 'Bearer owner-token'
                page.evaluate("window.renderWorks(true, 'owner')")
                expect(dialog.get_by_role('img', name='Panorama preview')).to_be_visible()
                page.evaluate("window.renderWorks(false, 'owner')")
                expect(dialog).to_be_hidden()
            work['thumbnail'] = None
            page.evaluate("window.renderWorks(true, 'owner')")
            dialog = page.get_by_role('dialog')
            expect(dialog.get_by_text('Old work')).to_be_visible()
            before = len(posts)
            dialog.get_by_role('button', name='Open panorama').click()
            expect(dialog).to_be_hidden()
            page.evaluate("localStorage.setItem('panorama_server_user_token', 'other-token'); window.renderWorks(false, 'other')")
            page.wait_for_timeout(700)
            assert len(posts) == before
            browser.close()

    def test_thumbnail_helper_and_existing_thumbnail(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))
            page = browser.new_page(viewport={'width': 390, 'height': 700})
            page.goto(BASE)
            posts = []
            def respond(route):
                if route.request.method == 'POST':
                    posts.append((route.request.headers, route.request.post_data_json))
                    route.fulfill(json={'success': True})
                else:
                    route.fulfill(json={'works': []})
            page.route('**/api/works**', respond)
            result = page.evaluate("""async () => {
              localStorage.setItem('panorama_server_user_token', 'owner-token');
              const {saveWorkThumbnail} = await import('/src/utils/workThumbnail.ts');
              const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 500;
              const context = canvas.getContext('2d');
              const pixels = context.createImageData(1000, 500);
              let seed = 1;
              for (let i = 0; i < pixels.data.length; i += 4) { seed = (seed * 1664525 + 1013904223) >>> 0; pixels.data[i] = seed >>> 24; pixels.data[i + 1] = seed >>> 16; pixels.data[i + 2] = seed >>> 8; pixels.data[i + 3] = 255; }
              context.putImageData(pixels, 0, 0);
              const source = canvas.toDataURL('image/png');
              const thumbnail = await saveWorkThumbnail('a'.repeat(32), source, 'owner-token', new AbortController().signal);
              const img = new Image(); img.src = thumbnail; await img.decode();
              const aborted = new AbortController(); aborted.abort();
              let rejectedAbort = false, rejectedSession = false;
              try { await saveWorkThumbnail('a'.repeat(32), source, 'owner-token', aborted.signal); } catch { rejectedAbort = true; }
              try { await saveWorkThumbnail('a'.repeat(32), source, 'other-token', new AbortController().signal); } catch { rejectedSession = true; }
              return {thumbnail, width: img.width, height: img.height, rejectedAbort, rejectedSession};
            }""")
            assert result['width'] <= 320 and result['width'] == result['height'] * 2
            assert result['thumbnail'].startswith('data:image/jpeg;base64,')
            assert result['rejectedAbort'] and result['rejectedSession'] and len(posts) == 1
            assert posts[0][0]['authorization'] == 'Bearer owner-token'
            assert posts[0][1]['thumbnail'] == result['thumbnail']
            import json
            assert len(json.dumps(posts[0][1], separators=(',', ':')).encode()) <= 20 * 1024
            saved_work = {'id': 'b' * 32, 'prompt': 'Saved preview', 'model': 'model', 'width': 1000, 'height': 500, 'mime': 'image/png', 'created_at': 1700000000000, 'thumbnail': result['thumbnail']}
            page.unroute('**/api/works**', respond)
            page.route('**/api/works**', lambda route: route.fulfill(json={'works': [saved_work]}))
            page.evaluate("""async () => {
              const {default: React} = await import('/node_modules/.vite/deps/react.js');
              const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
              const {MyWorks} = await import('/src/components/commercial/MyWorks.tsx');
              const host = document.createElement('div'); document.body.appendChild(host);
              (dom.default ?? dom).createRoot(host).render(React.createElement(MyWorks, {isOpen: true, accountId: 'owner', onClose() {}, onOpen: async () => {}}));
            }""")
            expect(page.get_by_role('dialog').get_by_role('img', name='Panorama preview')).to_be_visible()
            assert len(posts) == 1
            page.evaluate("document.querySelector('dialog img').dispatchEvent(new Event('error'))")
            expect(page.get_by_role('dialog').get_by_role('img', name='Panorama preview')).to_have_count(0)
            expect(page.get_by_role('dialog').get_by_text('Saved preview')).to_be_visible()
            browser.close()

if __name__ == '__main__':
    unittest.main()
