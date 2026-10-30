"""Run npm run build, Vite preview on 5173 and email_browser_server.mjs on 3001; external services are mocked."""
import json
import os
import re
import unittest
import urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:5173'


class EmailVerificationBrowser(unittest.TestCase):
    def test_underage_screen_hides_credentials_and_survives_reload(self):
        with sync_playwright() as runtime:
            browser = runtime.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))
            context = browser.new_context(viewport={'width': 320, 'height': 844})
            external_requests = []
            context.route('**/*', lambda route: route.continue_() if route.request.url.startswith((BASE, 'data:', 'blob:')) else (external_requests.append(route.request.url), route.abort())[-1])
            page = context.new_page()
            auth_requests = []
            page.on('request', lambda request: auth_requests.append(request.url) if request.url.endswith('/api/user/auth') else None)
            try:
                page.goto(BASE, wait_until='networkidle')
                page.get_by_role('button', name='Sign in', exact=True).first.click()
                dialog = page.get_by_role('dialog')
                dialog.get_by_role('button', name='Create account', exact=True).click()
                expect(dialog.get_by_label('Email address', exact=True)).to_have_count(0)
                expect(dialog.get_by_label('Password', exact=True)).to_have_count(0)
                expect(dialog.get_by_label('Date of birth', exact=True)).to_have_value('')
                dialog.get_by_label('Date of birth', exact=True).fill('2020-01-01')
                dialog.get_by_role('button', name='Continue', exact=True).click()
                expect(dialog.get_by_role('status')).to_have_text('Account registration is unavailable.')
                expect(dialog.get_by_label('Date of birth', exact=True)).to_have_count(0)
                self.assertLessEqual(dialog.evaluate('el => el.scrollWidth'), dialog.evaluate('el => el.clientWidth'))
                page.reload(wait_until='networkidle')
                page.get_by_role('button', name='Sign in', exact=True).first.click()
                dialog.get_by_role('button', name='Create account', exact=True).click()
                expect(dialog.get_by_role('status')).to_have_text('Account registration is unavailable.')
                dialog.get_by_role('button', name='Sign in', exact=True).click()
                expect(dialog.get_by_label('Password', exact=True)).to_be_visible()
                self.assertEqual(auth_requests, [])
                self.assertFalse(any('challenges.cloudflare.com' in url for url in external_requests))
                self.assertFalse(any('fonts.googleapis.com' in url or 'fonts.gstatic.com' in url for url in external_requests))
                page.screenshot(path='/tmp/panorama-legal-age-screen.png')
            finally:
                context.close()
                browser.close()

    def test_checkout_discloses_live_amount_interval_and_pending_order_terms(self):
        with sync_playwright() as runtime:
            browser = runtime.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            context.route('**/*', lambda route: route.continue_() if route.request.url.startswith((BASE, 'data:', 'blob:')) else route.abort())
            user = {'id': 'usr_legal_test', 'email': 'legal@example.test', 'name': 'Test account', 'plan': 'free', 'creditsBalance': 0, 'creditsTotal': 0, 'status': 'active', 'emailVerified': True}
            context.add_init_script("localStorage.setItem('panorama_server_user_token', 'synthetic-token'); localStorage.setItem('panorama_current_user_id', 'usr_legal_test'); localStorage.setItem('panorama_admin_users_config', " + json.dumps(json.dumps([user])) + ");")
            context.route('**/api/user/me', lambda route: route.fulfill(json={'success': True, 'user': user}))
            config = {'enabled': True, 'mode': 'sandbox', 'plans': {
                'pro': {'monthly': {'amountCents': 990, 'credits': 120}, 'yearly': {'amountCents': 9900, 'credits': 1440}},
                'enterprise': {'monthly': {'amountCents': 2999, 'credits': 400}, 'yearly': {'amountCents': 29900, 'credits': 4800}}}}
            context.route('**/api/paypal/config', lambda route: route.fulfill(json=config))
            pending = {'subscription': None}
            context.route('**/api/paypal/subscription', lambda route: route.fulfill(json=pending))
            page = context.new_page()
            try:
                page.goto(BASE + '/#pricing', wait_until='networkidle')
                expect(page.locator('#pro-renewal-terms')).to_contain_text('$19.00 USD each month')
                page.get_by_role('button', name='Annual billing', exact=True).click()
                expect(page.locator('#pro-renewal-terms')).to_contain_text('$118.80 USD each year')
                page.get_by_role('button', name='Choose Pro Creator', exact=True).click()
                dialog = page.get_by_role('dialog')
                terms = dialog.locator('#checkout-renewal-terms')
                expect(terms).to_contain_text('$118.80 USD each year. Automatically renews until cancelled.')
                expect(terms).to_contain_text('Cancel before your next billing date')
                expect(dialog.get_by_role('button', name='Subscribe with PayPal')).to_have_attribute('aria-describedby', 'checkout-renewal-terms')
                for width in [320, 390, 1440]:
                    page.set_viewport_size({'width': width, 'height': 844})
                    self.assertLessEqual(dialog.evaluate('el => el.scrollWidth'), dialog.evaluate('el => el.clientWidth'))
                page.set_viewport_size({'width': 390, 'height': 844})
                dialog.get_by_role('button', name='Subscribe with PayPal').scroll_into_view_if_needed()
                page.screenshot(path='/tmp/panorama-legal-renewal-terms.png')
                dialog.get_by_role('button', name='Close checkout').click()
                pending['subscription'] = {'id': 'pending-legal', 'plan': 'enterprise', 'billingCycle': 'monthly', 'amountCents': 3200, 'status': 'APPROVAL_PENDING', 'paidThrough': '', 'approvalUrl': '', 'paypalId': 'I-TEST'}
                page.get_by_role('button', name='Choose Pro Creator', exact=True).click()
                expect(terms).to_contain_text('$32.00 USD each month')
                expect(dialog.get_by_role('button', name='Continue PayPal approval')).to_be_enabled()
                self.assertNotIn('$49.00', terms.inner_text())
                dialog.get_by_role('button', name='Close checkout').click()
                response = page.goto(BASE + '/copyright/', wait_until='networkidle')
                self.assertEqual(response.status, 200)
                expect(page.get_by_role('heading', name='Copyright reports', exact=True)).to_be_visible()
                expect(page.locator('a[href^="mailto:support@360panoramaviewer.com"]')).to_be_visible()
            finally:
                context.close()
                browser.close()

    def test_registration_email_confirmation_and_existing_session(self):
        with sync_playwright() as runtime:
            browser = runtime.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            context.route('**/*', lambda route: route.continue_() if route.request.url.startswith((BASE, 'data:', 'blob:')) else route.abort())
            context.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', lambda route: route.fulfill(content_type='application/javascript', body="""
              window.challengeCallbacks = [];
              window.turnstile = {
                render(element, options) {
                  window.challengeCallbacks.push(options);
                  const box = document.createElement('div');
                  box.textContent = 'Local test security check';
                  box.style.width = options.size === 'compact' ? '150px' : '300px';
                  box.style.height = options.size === 'compact' ? '140px' : '65px';
                  element.replaceChildren(box);
                  queueMicrotask(() => options.callback(options.action + ':' + crypto.randomUUID()));
                  return String(window.challengeCallbacks.length);
                }, remove() {}
              };
            """))
            page = context.new_page()
            guest_calls = []
            page.on('request', lambda request: guest_calls.append(request.url) if '/api/user/guest' in request.url else None)
            try:
                page.goto(BASE, wait_until='networkidle')
                page.locator('#prompt-input').fill('A peaceful coastal panorama')
                page.get_by_role('button', name=re.compile(r'^Generate \(')).click()
                dialog = page.get_by_role('dialog')
                expect(dialog).to_be_visible()
                dialog.get_by_role('button', name='Create account', exact=True).click()
                expect(dialog.get_by_label('Email address', exact=True)).to_have_count(0)
                dialog.get_by_label('Date of birth', exact=True).fill('1990-01-01')
                dialog.get_by_role('button', name='Continue', exact=True).click()
                expect(dialog.get_by_role('button', name='Create free account', exact=True)).to_be_enabled()
                dialog.get_by_label('Email address', exact=True).fill('browser@example.test')
                dialog.get_by_label('Password', exact=True).fill('synthetic-browser-password')
                page.evaluate("window.challengeCallbacks.at(-1)['expired-callback']()")
                expect(dialog.get_by_role('button', name='Create free account', exact=True)).to_be_disabled()
                page.evaluate("window.challengeCallbacks.at(-1)['error-callback']()")
                expect(dialog.get_by_role('alert')).to_be_visible()
                page.evaluate("window.challengeCallbacks.at(-1).callback('register:' + crypto.randomUUID())")
                expect(dialog.get_by_role('alert')).to_have_count(0)
                dialog.get_by_role('button', name='Create free account', exact=True).click()
                expect(dialog.get_by_text('Verification email sent. Check your inbox and spam folder.', exact=True)).to_be_visible()
                expect(dialog.get_by_role('button', name='Sign out', exact=True)).to_be_visible()
                token = page.evaluate("localStorage.getItem('panorama_server_user_token')")
                profile = page.request.get(BASE + '/api/user/me', headers={'Authorization': 'Bearer ' + token}).json()['user']
                self.assertFalse(profile['emailVerified'])
                self.assertEqual(profile['creditsBalance'], 0)
                blocked = page.request.post(BASE + '/api/generate', headers={'Authorization': 'Bearer ' + token}, data={'prompt': 'must not call a model'})
                self.assertEqual(blocked.status, 403)
                self.assertEqual(blocked.json()['code'], 'EMAIL_VERIFICATION_REQUIRED')
                for width in [320, 390, 1440]:
                    page.set_viewport_size({'width': width, 'height': 844})
                    self.assertLessEqual(dialog.evaluate('el => el.scrollWidth'), dialog.evaluate('el => el.clientWidth'))
                    expect(dialog.get_by_role('button', name='Sign out', exact=True)).to_be_visible()
                page.set_viewport_size({'width': 390, 'height': 844})
                page.screenshot(path='/tmp/panorama-email-awaiting-verification.png')
                mails = json.load(urllib.request.urlopen('http://127.0.0.1:3001/__test/mail'))
                link = re.search(r'http://localhost:5173/#verify-email=[a-f0-9]{64}', mails[-1]['text']).group(0)
                page.goto(link, wait_until='networkidle')
                expect(page).to_have_url(BASE + '/')
                expect(dialog.get_by_role('button', name='Verify email', exact=True)).to_be_visible()
                self.assertEqual(page.request.get(BASE + '/api/user/me', headers={'Authorization': 'Bearer ' + token}).json()['user']['creditsBalance'], 0)
                dialog.get_by_role('button', name='Verify email', exact=True).click()
                expect(dialog.get_by_text('Email verified. 8 starter credits have been added.', exact=True)).to_be_visible()
                expect(dialog.get_by_role('button', name='Resend verification email', exact=True)).to_have_count(0)
                profile = page.request.get(BASE + '/api/user/me', headers={'Authorization': 'Bearer ' + token}).json()['user']
                self.assertTrue(profile['emailVerified'])
                self.assertEqual(profile['creditsBalance'], 8)
                page.goto(link, wait_until='networkidle')
                dialog.get_by_role('button', name='Verify email', exact=True).click()
                expect(dialog.get_by_text('Email verified. You can sign in to use your account.', exact=True)).to_be_visible()
                self.assertEqual(page.request.get(BASE + '/api/user/me', headers={'Authorization': 'Bearer ' + token}).json()['user']['creditsBalance'], 8)
                self.assertEqual(guest_calls, [])
            finally:
                context.close()
                browser.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
