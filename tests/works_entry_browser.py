"""With Vite running, verify account/library navigation and session isolation."""
import json
import os
import re
import unittest
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('PANORAMA_BASE_URL', 'http://127.0.0.1:5188')

class WorksEntryBrowser(unittest.TestCase):
    def test_navigation_focus_session_and_historical_share(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            user = {'id': 'usr_test', 'name': 'Tester', 'email': 'test@example.test', 'plan': 'free', 'creditsBalance': 9, 'creditsTotal': 9, 'status': 'active', 'emailVerified': True}
            context.add_init_script("localStorage.setItem('panorama_server_user_token','token-a'); localStorage.setItem('panorama_current_user_id','usr_test'); localStorage.setItem('panorama_admin_users_config'," + json.dumps(json.dumps([user])) + ");")
            context.route('**/api/user/me', lambda route: route.fulfill(json={'success': True, 'user': user}))
            work = {'id': 'a' * 32, 'prompt': 'Historic forest', 'model': 'test', 'width': 2, 'height': 1, 'mime': 'image/png', 'created_at': 1700000000000}
            context.route('**/api/works**', lambda route: route.fulfill(json={'imageUrl': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='} if route.request.url.endswith('/original') else {'works': [work]}))
            context.route('**/api/shares', lambda route: route.fulfill(json={'shares': []}))
            page = context.new_page()
            page.goto(BASE + '/360-image-maker/')
            page.set_viewport_size({'width': 320, 'height': 844})
            header = page.locator('header')
            works_button = header.get_by_role('button', name='My works', exact=True)
            expect(works_button).to_be_visible()
            assert works_button.bounding_box()['x'] >= 0 and works_button.bounding_box()['x'] + works_button.bounding_box()['width'] <= 320
            page.set_viewport_size({'width': 390, 'height': 844})
            prompt = page.locator('textarea').first
            prompt.fill('Unfinished new prompt')
            page.get_by_role('link', name=re.compile('360° Viewer')).first.click()
            header = page.locator('header')
            header.get_by_role('button', name='My works', exact=True).click()
            library = page.get_by_role('dialog', name='My Creations')
            expect(library).to_be_visible()
            expect(library.get_by_text('Historic forest')).to_be_visible()
            library.get_by_role('button', name='Close', exact=True).click()
            expect(header.get_by_role('button', name='My works', exact=True)).to_be_focused()
            expect(prompt).to_have_value('Unfinished new prompt')
            header.get_by_role('button', name=re.compile('Open your account')).click()
            account = page.get_by_role('dialog', name='Your account')
            account.get_by_role('button', name='My works', exact=True).click()
            expect(library).to_be_visible()
            library.get_by_role('button', name='Close', exact=True).click()
            expect(header.get_by_role('button', name=re.compile('Open your account'))).to_be_focused()
            header.get_by_role('button', name='My works', exact=True).click()
            library.get_by_role('button', name='Share', exact=True).click()
            share = page.get_by_role('dialog').filter(has=page.get_by_text('Share your panorama'))
            expect(share).to_be_visible()
            expect(share.locator('input').first).to_have_value('Historic forest')
            share.get_by_role('button', name=re.compile('Close')).first.click()
            expect(page.get_by_role('button', name='Download model original')).to_be_visible()
            header.get_by_role('button', name='My works', exact=True).click()
            expect(library).to_be_visible()
            page.evaluate("localStorage.removeItem('panorama_server_user_token'); window.dispatchEvent(new Event('panorama-session-changed'))")
            expect(library).not_to_be_visible()
            expect(page.get_by_role('button', name='Download model original')).to_have_count(0)
            context.close()
            browser.close()

if __name__ == '__main__': unittest.main()
