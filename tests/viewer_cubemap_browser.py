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

BASE_URL = os.environ.get('PANORAMA_BASE_URL', 'http://localhost:5173')


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

    def test_entry_shell_hides_text_and_can_recover_when_assets_fail(self):
        def block_assets(route):
            if route.request.resource_type in ('script', 'stylesheet'):
                route.abort()
            else:
                route.continue_()

        self.context.route('**/*', block_assets)
        for route in ['/', '/360-panorama-viewer/', '/cubemap-generator/', '/hdri-viewer/', '/developers/']:
            for width in [320, 390, 1440]:
                with self.subTest(route=route, width=width):
                    self.page.set_viewport_size({'width': width, 'height': 900})
                    self.page.goto(BASE_URL + route, wait_until='load')
                    fallback = self.page.locator('#root > [data-app-fallback]')
                    expect(fallback).to_be_hidden()
                    expect(self.page.locator('[data-app-startup]')).to_be_visible()
                    expect(self.page.get_by_role('status')).to_have_text('Loading…')
                    self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), width)
                    button = self.page.get_by_role('button', name='View basic page', exact=True)
                    button.focus()
                    button.press('Enter')
                    expect(self.page.locator('[data-app-startup]')).to_be_hidden()
                    expect(fallback).to_be_visible()
                    heading = fallback.locator('h1')
                    expect(heading).to_be_visible()
                    self.assertGreaterEqual(heading.evaluate('el => parseFloat(getComputedStyle(el).fontSize)'), 32)
                    self.assertGreaterEqual(fallback.locator('p').first.evaluate('el => parseFloat(getComputedStyle(el).lineHeight)'), 24)
                    self.assertEqual(fallback.evaluate('el => getComputedStyle(el).backgroundColor'), 'rgb(11, 17, 21)')
                    self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), width)

        self.context.unroute('**/*', block_assets)
        self.page.goto(BASE_URL + '/360-panorama-viewer/')
        expect(self.page.locator('[data-app-fallback]')).to_have_count(0)
        expect(self.page.locator('[data-app-startup]')).to_have_count(0)
        expect(self.page.get_by_label('Open local panorama')).to_be_visible()

    def test_delayed_app_scripts_never_paint_the_static_text(self):
        for route in ['/', '/360-panorama-viewer/', '/cubemap-generator/', '/hdri-viewer/', '/developers/']:
            with self.subTest(route=route):
                pending = []

                def delay_scripts(request):
                    if request.request.resource_type == 'script':
                        pending.append(request)
                    else:
                        request.continue_()

                self.context.route('**/*', delay_scripts)
                try:
                    self.page.goto(BASE_URL + route, wait_until='commit')
                    expect(self.page.get_by_role('status')).to_have_text('Loading…')
                    expect(self.page.locator('[data-app-fallback]')).to_be_hidden()
                    # Sample painted frames while the actual application scripts are held back.
                    self.assertFalse(self.page.evaluate("""() => new Promise(resolve => {
                      let frames = 0, visible = false;
                      function sample() {
                        const fallback = document.querySelector('[data-app-fallback]');
                        visible ||= !!fallback && fallback.getBoundingClientRect().height > 0;
                        if (++frames === 12) resolve(visible); else requestAnimationFrame(sample);
                      }
                      requestAnimationFrame(sample);
                    })"""))
                    self.context.unroute('**/*', delay_scripts)
                    for request in pending:
                        request.continue_()
                    expect(self.page.locator('.studio-shell')).to_be_visible()
                    expect(self.page.locator('[data-app-startup]')).to_have_count(0)
                    expect(self.page.locator('[data-app-fallback]')).to_have_count(0)
                finally:
                    self.context.unroute('**/*', delay_scripts)

    def test_entry_fallback_remains_readable_without_javascript(self):
        context = self.browser.new_context(java_script_enabled=False, viewport={'width': 390, 'height': 844})
        try:
            page = context.new_page()
            page.goto(BASE_URL)
            fallback = page.locator('[data-app-fallback]')
            expect(page.locator('[data-app-startup]')).to_be_hidden()
            expect(fallback.locator('h1')).to_be_visible()
            expect(fallback.get_by_role('link', name='360 Panorama Viewer', exact=True)).to_be_visible()
            expect(fallback.get_by_role('heading', name='Frequently Asked Questions')).to_be_visible()
            self.assertGreaterEqual(fallback.locator('h1').evaluate('el => parseFloat(getComputedStyle(el).fontSize)'), 32)
        finally:
            context.close()

    def mount(self, component, props=None, export_name=None):
        self.page.evaluate("""async ({component, props, exportName}) => {
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
          window.fixtureRender = extra => window.fixtureRoot.render(React.createElement(module[exportName || component.split('/').pop()], {...window.fixtureProps, ...extra}));
          window.fixtureRoot = createRoot(fixture);
          window.fixtureRender({});
        }""", {"component": component, "props": props or {}, "exportName": export_name})
        return self.page.locator('#regression-fixture')

    def test_homepage_coastal_panorama_renders_and_responds_to_drag(self):
        self.page.emulate_media(reduced_motion='reduce')
        for width in [390, 1440]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width': width, 'height': 900})
                self.page.goto(BASE_URL)
                canvas = self.page.locator('.studio-home .studio-hero-panorama canvas')
                expect(canvas).to_be_visible()
                expect(canvas).to_have_css('opacity', '1')
                before = canvas.screenshot()
                box = canvas.bounding_box()
                x, y = box['x'] + box['width'] * .85, box['y'] + box['height'] * .4
                self.page.mouse.move(x, y)
                self.page.mouse.down()
                self.page.mouse.move(x - 100, y + 15, steps=12)
                self.page.mouse.up()
                self.assertNotEqual(before, canvas.screenshot(), 'drag must change the rendered sea view')
        self.page.mouse.wheel(0, 400)
        self.page.wait_for_function('window.scrollY > 0')

    def test_homepage_panorama_rotates_when_motion_is_allowed(self):
        self.page.emulate_media(reduced_motion='no-preference')
        self.page.goto(BASE_URL)
        canvas = self.page.locator('.studio-home .studio-hero-panorama canvas')
        expect(canvas).to_have_css('opacity', '1')
        before = canvas.screenshot()
        # The hero intentionally waits 2.2 seconds before resuming its idle rotation.
        self.page.wait_for_timeout(3000)
        self.assertNotEqual(before, canvas.screenshot(), 'idle rotation must change the rendered sea view')

    def test_free_tools_and_studio_do_not_mint_guest_trials(self):
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
        self.page.wait_for_load_state('networkidle')
        count = len(trials)
        self.assertEqual(count, 0)
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

    def test_mobile_header_keeps_tools_and_account_actions_reachable(self):
        for width in [320, 375, 390, 640, 768, 820, 1024, 1280, 1440]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width': width, 'height': 844})
                self.page.goto(BASE_URL + '/360-panorama-viewer/')
                header = self.page.locator('header')
                self.assertLessEqual(header.bounding_box()['height'], 144)
                for control in header.locator('a:visible, button:visible').all():
                    box = control.bounding_box()
                    self.assertGreaterEqual(box['x'], 0)
                    self.assertLessEqual(box['x'] + box['width'], width)
                    if width < 1200:
                        self.assertGreaterEqual(box['height'], 44)
                nav = header.get_by_role('navigation', name='Main navigation')
                nav_box = nav.bounding_box()
                for control in nav.locator(':scope > a:visible, :scope > div > button:visible').all():
                    box = control.bounding_box()
                    self.assertGreaterEqual(box['x'], nav_box['x'])
                    self.assertLessEqual(box['x'] + box['width'], nav_box['x'] + nav_box['width'])
                if width >= 1280:
                    regions = [header.get_by_role('link', name='360 Panorama Viewer home').bounding_box(),
                               nav_box, header.locator('.studio-account-actions').bounding_box()]
                    for index, first in enumerate(regions):
                        for second in regions[index + 1:]:
                            if first['y'] < second['y'] + second['height'] and second['y'] < first['y'] + first['height']:
                                self.assertTrue(first['x'] + first['width'] <= second['x'] or
                                                second['x'] + second['width'] <= first['x'],
                                                f'Header regions overlap at {width}px: {first}, {second}')
                header.get_by_role('button', name='Sign in', exact=True).click()
                expect(self.page.get_by_role('dialog').get_by_role('button', name='Create account', exact=True)).to_be_visible()
                self.page.get_by_role('button', name='Close account dialog').click()
                tools = header.get_by_role('button', name='Tools', exact=True)
                tools.focus()
                tools.press('Enter')
                expect(tools).to_have_attribute('aria-expanded', 'true')
                menu = self.page.locator('#studio-tools-menu')
                menu_box = menu.bounding_box()
                self.assertGreaterEqual(menu_box['x'], 0)
                self.assertLessEqual(menu_box['x'] + menu_box['width'], width)
                menu.get_by_role('button', name='Cubemap 6-Sided Slicer Export ZIP for game engines').click()
                expect(self.page).to_have_url(BASE_URL + '/cubemap-generator/')
                expect(tools).to_have_attribute('aria-expanded', 'false')
        user = {'id': 'usr_mobile_fixture', 'name': 'Mobile fixture', 'email': 'mobile@example.invalid',
                'plan': 'pro', 'creditsBalance': 10000, 'creditsTotal': 10000, 'status': 'active',
                'joinedAt': '2026-01-01', 'lastActiveAt': 'Now', 'apiCallsCount': 0}
        self.page.evaluate("""user => {
          localStorage.setItem('panorama_admin_users_config', JSON.stringify([user]));
          localStorage.setItem('panorama_current_user_id', user.id);
        }""", user)
        self.page.set_viewport_size({'width': 320, 'height': 844})
        self.page.goto(BASE_URL + '/360-panorama-viewer/')
        header = self.page.locator('header')
        account = header.get_by_role('button', name=re.compile(r'^Open your account\b'))
        expect(account).to_be_visible()
        expect(account).to_contain_text('10000')
        expect(header.get_by_role('button', name='Manage', exact=True)).to_be_visible()
        self.assertLessEqual(header.bounding_box()['height'], 144)
        for control in header.locator('a:visible, button:visible').all():
            box = control.bounding_box()
            self.assertGreaterEqual(box['x'], 0)
            self.assertLessEqual(box['x'] + box['width'], 320)
            self.assertGreaterEqual(box['height'], 44)

    def test_tools_menu_fits_short_mobile_screen_and_scrolls_to_last_item(self):
        for width, height in [(320, 568), (568, 320), (390, 844)]:
            with self.subTest(width=width, height=height):
                self.page.set_viewport_size({'width': width, 'height': height})
                self.page.goto(BASE_URL + '/360-panorama-viewer/')
                tools = self.page.get_by_role('button', name='Tools', exact=True)
                tools.focus()
                tools.press('Enter')
                menu = self.page.locator('#studio-tools-menu')
                box = menu.bounding_box()
                self.assertGreaterEqual(box['x'], 0)
                self.assertGreaterEqual(box['y'], 0)
                self.assertLessEqual(box['x'] + box['width'], width)
                self.assertLessEqual(box['y'] + box['height'], height)
                last = menu.locator('button, a').last
                last.focus()
                expect(last).to_be_focused()
                last_box = last.bounding_box()
                self.assertGreaterEqual(last_box['y'], box['y'])
                self.assertLessEqual(last_box['y'] + last_box['height'], box['y'] + box['height'])

    def test_main_tools_fit_mobile_and_desktop_in_both_browser_color_schemes(self):
        for scheme, width in [('dark', 320), ('dark', 390), ('light', 390), ('dark', 1280)]:
            self.page.emulate_media(color_scheme=scheme)
            self.page.set_viewport_size({'width': width, 'height': 844})
            for route in ['/', '/360-panorama-viewer/', '/360-image-maker/', '/cubemap-generator/']:
                with self.subTest(scheme=scheme, width=width, route=route):
                    self.page.goto(BASE_URL + route)
                    expect(self.page.locator('[data-app-fallback]')).to_have_count(0)
                    expect(self.page.get_by_role('heading', level=1)).to_be_visible()
                    self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), width)
                    self.assertIn('dark', self.page.locator('html').evaluate('el => getComputedStyle(el).colorScheme'))

    def test_dark_native_controls_are_declared_before_app_assets_load(self):
        def block_assets(route):
            if route.request.resource_type in ('script', 'stylesheet'):
                route.abort()
            else:
                route.continue_()

        self.context.route('**/*', block_assets)
        try:
            for scheme in ['light', 'dark']:
                self.page.emulate_media(color_scheme=scheme)
                for route in ['/', '/360-panorama-viewer/', '/360-image-maker/', '/cubemap-generator/']:
                    with self.subTest(scheme=scheme, route=route):
                        self.page.goto(BASE_URL + route, wait_until='load')
                        expect(self.page.locator('[data-app-fallback]')).to_be_hidden()
                        expect(self.page.locator('[data-app-startup]')).to_be_visible()
                        self.assertIn('dark', self.page.locator('html').evaluate('el => getComputedStyle(el).colorScheme'))
                        expect(self.page.locator('meta[name="color-scheme"]')).to_have_attribute('content', re.compile('dark'))
        finally:
            self.context.unroute('**/*', block_assets)

    def assert_readable_form_control(self, control):
        metrics = control.evaluate("""el => {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d');
          const rgba = value => {
            context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data].map(n => n / 255);
          };
          const over = (front, back) => front.slice(0, 3).map((n, i) => n * front[3] + back[i] * (1 - front[3]));
          const ancestors = []; for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
          let background = [1, 1, 1];
          for (const node of ancestors) background = over(rgba(getComputedStyle(node).backgroundColor), background);
          const style = getComputedStyle(el);
          const foreground = over(rgba(style.color), background);
          const luminance = rgb => rgb.map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
            .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
          const light = luminance(foreground), dark = luminance(background);
          return {fontSize: parseFloat(style.fontSize), contrast: (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05)};
        }""")
        self.assertGreaterEqual(metrics['fontSize'], 16)
        self.assertGreaterEqual(metrics['contrast'], 4.5)

    def test_mobile_studio_starts_with_a_readable_prompt(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        for scheme in ['light', 'dark']:
            with self.subTest(scheme=scheme):
                self.page.emulate_media(color_scheme=scheme)
                self.page.goto(BASE_URL + '/360-image-maker/')
                prompt = self.page.locator('#prompt-input')
                expect(prompt).to_be_visible()
                box = prompt.bounding_box()
                self.assertLess(box['y'], 844)
                self.assertGreaterEqual(min(box['y'] + box['height'], 844) - box['y'], 44)
                prompt.fill('A quiet mountain lake at sunrise')
                expect(prompt).to_have_value('A quiet mountain lake at sunrise')
                for control in self.page.locator('textarea:visible, select:visible').all():
                    self.assert_readable_form_control(control)
        self.page.get_by_role('button', name='Image to Pano', exact=True).click()
        png = self.page.evaluate("""() => {
          const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 16;
          return canvas.toDataURL().split(',')[1];
        }""")
        self.page.locator('#reference-uploader input[type=file]').set_input_files(
            {'name': 'reference.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(png)})
        remove = self.page.get_by_role('button', name='Remove reference reference.png', exact=True)
        expect(remove).to_be_visible()
        self.assertGreaterEqual(remove.bounding_box()['height'], 44)
        self.assertEqual(remove.evaluate('el => getComputedStyle(el.parentElement).opacity'), '1')
        remove.click()
        expect(self.page.get_by_role('img', name='reference.png', exact=True)).to_have_count(0)

    def test_mobile_viewer_upload_and_optional_tools_remain_usable(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.page.goto(BASE_URL + '/360-panorama-viewer/')
        picker = self.page.get_by_label('Open local panorama')
        self.assertGreaterEqual(picker.locator('..').bounding_box()['height'], 44)
        png = self.page.evaluate("""() => {
          const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 16;
          canvas.getContext('2d').fillRect(0, 0, 32, 16);
          return canvas.toDataURL().split(',')[1];
        }""")
        picker.set_input_files({'name': 'local.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(png)})
        expect(self.page.locator('canvas')).to_be_visible()
        more = self.page.locator('details').filter(has=self.page.locator('summary').filter(has_text='Enhance & embed')).first
        expect(more).not_to_have_attribute('open', '')
        expect(self.page.get_by_role('button', name='Embed', exact=True)).to_be_hidden()
        more.locator(':scope > summary').focus()
        self.page.keyboard.press('Enter')
        expect(self.page.get_by_role('button', name='Embed', exact=True)).to_be_visible()
        repair = self.page.locator('details').filter(has=self.page.locator('summary').filter(has_text='Repair Poles')).last
        repair.locator(':scope > summary').click()
        expect(self.page.get_by_role('button', name=re.compile('Auto Heal Zenith & Nadir'))).to_be_visible()
        self.page.get_by_role('button', name='Embed', exact=True).click()
        dialog = self.page.get_by_role('dialog')
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role('heading', name='Embed 360° Panorama Viewer')).to_be_visible()
        close = dialog.get_by_role('button', name='Close modal')
        close.scroll_into_view_if_needed()
        self.assertGreaterEqual(close.bounding_box()['height'], 44)
        close.click()
        expect(dialog).to_have_count(0)
        self.page.set_viewport_size({'width': 320, 'height': 844})
        flat_png = self.page.evaluate("""() => {
          const canvas = document.createElement('canvas'); canvas.width = 3; canvas.height = 2;
          return canvas.toDataURL().split(',')[1];
        }""")
        picker.set_input_files({'name': 'phone-photo.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(flat_png)})
        expect(self.page.get_by_text('Non-2:1 Aspect Ratio Detected', exact=False)).to_be_visible()
        for label in ['180° Curved Screen', 'Auto-Fit to 2:1 Panorama']:
            control = self.page.get_by_role('button', name=label, exact=True)
            expect(control).to_be_visible()
            box = control.bounding_box()
            self.assertGreaterEqual(box['x'], 0)
            self.assertLessEqual(box['x'] + box['width'], 320)
            self.assertGreaterEqual(box['height'], 44)

    def test_account_dialog_fits_mobile_and_short_viewports(self):
        self.page.emulate_media(color_scheme='dark')
        for height in [844, 450]:
            with self.subTest(height=height):
                self.page.set_viewport_size({'width': 390, 'height': height})
                self.page.goto(BASE_URL + '/360-panorama-viewer/')
                self.page.locator('header').get_by_role('button', name='Sign in', exact=True).click()
                dialog = self.page.get_by_role('dialog')
                expect(dialog).to_be_visible()
                for control in dialog.locator('input:visible').all():
                    self.assert_readable_form_control(control)
                password = dialog.get_by_label('Password', exact=True)
                password.fill('Local test only')
                show = dialog.get_by_role('button', name='Show password')
                show.scroll_into_view_if_needed()
                self.assertGreaterEqual(show.bounding_box()['height'], 44)
                self.assertGreaterEqual(show.bounding_box()['width'], 44)
                show.click()
                expect(password).to_have_attribute('type', 'text')
                submit = dialog.locator('button[type="submit"]')
                submit.scroll_into_view_if_needed()
                box = submit.bounding_box()
                self.assertGreaterEqual(box['y'], 0)
                self.assertLessEqual(box['y'] + box['height'], height)
                close = dialog.get_by_role('button', name='Close account dialog')
                close.scroll_into_view_if_needed()
                box = close.bounding_box()
                self.assertGreaterEqual(box['height'], 44)
                self.assertGreaterEqual(box['y'], 0)
                self.assertLessEqual(box['y'] + box['height'], height)
                close.click()
                expect(dialog).to_have_count(0)

    def test_viewer_controls_fit_narrow_screens_and_keep_desktop_radar(self):
        fixture = self.mount('SphereViewer')
        for width in [320, 375, 390, 1280]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width': width, 'height': 844})
                fixture.evaluate('(el, width) => el.style.width = `${width - 32}px`', width)
                bounds = fixture.bounding_box()
                controls = fixture.locator('.viewer-controls')
                expect(controls).to_be_visible()
                for control in controls.locator('button:visible').all():
                    box = control.bounding_box()
                    self.assertGreaterEqual(box['x'], bounds['x'])
                    self.assertLessEqual(box['x'] + box['width'], bounds['x'] + bounds['width'])
                    self.assertLessEqual(box['y'] + box['height'], bounds['y'] + bounds['height'])
                    if width < 640:
                        self.assertGreaterEqual(box['width'], 44)
                        self.assertGreaterEqual(box['height'], 44)
                radar = controls.get_by_role('button', name='Hide radar minimap')
                if width < 640:
                    expect(radar).to_be_hidden()
                    controls.get_by_role('button', name='Tone & Audio', exact=True).click()
                    expect(fixture.get_by_text('Tone & Ambient Audio', exact=True)).to_be_visible()
                    controls.get_by_role('button', name='Tone & Audio', exact=True).click()
                else:
                    expect(radar).to_be_visible()
                    expect(fixture.get_by_test_id('viewer-minimap')).to_be_visible()
                    radar.click()
                    expect(fixture.get_by_test_id('viewer-minimap')).to_have_count(0)

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

    def test_generator_local_photo_reaches_generation_and_preview(self) -> None:
        fixture = self.mount('GeneratorTab')
        self.page.evaluate("""async () => {
          const storage = await import('/src/utils/adminStorage.ts');
          const user = {id:'usr_reference_fixture', name:'Reference test', plan:'pro', status:'active', creditsBalance:10};
          storage.saveStoredManagedUsers([user]); storage.setCurrentUserId(user.id);
          storage.saveStoredModelEndpoints([{id:'gpt-reference', name:'GPT Reference', model:'gpt-image-2.5', baseUrl:'http://localhost:8317', apiKey:'', isEnabled:true}]);
          storage.saveStoredRoutingConfig({mode:'single', primaryEndpointId:'gpt-reference'});
          localStorage.setItem('panorama_server_user_token','reference-fixture-token');
          window.fixtureProps = {...fixtureProps, currentUser:user, onPanoramaChange:url => {
            window.generatedPanorama = url; fixtureRender({currentPanoramaUrl:url});
          }};
          fixtureRender({});
        }""")
        fixture.get_by_role('button', name='Image to Pano', exact=True).click()
        expect(fixture.locator('#prompt-input')).to_have_value('')
        expect(fixture.locator('#environment-style')).to_have_value('custom')
        photo = self.page.evaluate('fixtureProps.textureUrl')
        fixture.locator('#reference-uploader input[type=file]').set_input_files({
            'name': 'my-room.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(photo.split(',')[1])
        })
        expect(fixture.get_by_role('img', name='my-room.png', exact=True)).to_be_visible()
        fixture.locator('#prompt-input').fill('Keep my room and extend the surroundings')
        fixture.get_by_role('button', name='1K', exact=True).click()
        calls = []
        def generate(route):
            calls.append(route.request.post_data_json)
            route.fulfill(content_type='application/json', body=json.dumps({
                'success': True, 'imageUrl': photo, 'remainingCredits': 9, 'creditsDeducted': 1,
                'quality': {'status': 'passed', 'issues': [], 'reviewModel': 'gemini-3-flash', 'attempts': 2}
            }))
        self.context.route('**/api/generate', generate)
        fixture.get_by_role('button', name='Generate (', exact=False).click()
        self.page.wait_for_function("typeof generatedPanorama === 'string'")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]['referenceImages'], [photo])
        self.assertEqual(calls[0]['endpointId'], 'gpt-reference')
        self.assertIn('Preserve recognizable subjects', calls[0]['prompt'])
        self.assertIn('Keep my room', calls[0]['prompt'])
        self.assertNotIn('cyberpunk', calls[0]['prompt'])
        expect(fixture.get_by_role('button', name='Download model original', exact=True)).to_be_visible()
        expect(fixture.get_by_text('AI quality check passed · Passed after one retry', exact=True)).to_be_visible()

    def test_generator_quality_rejection_stops_failover_and_retains_preview(self) -> None:
        fixture = self.mount('GeneratorTab')
        self.page.evaluate("""async () => {
          const storage = await import('/src/utils/adminStorage.ts');
          const user = {id:'usr_quality_fixture', name:'Quality test', plan:'pro', status:'active', creditsBalance:10};
          storage.saveStoredManagedUsers([user]); storage.setCurrentUserId(user.id);
          storage.saveStoredModelEndpoints([
            {id:'ep-primary', name:'Primary Gemini', model:'gemini-3.1-flash-image', baseUrl:'http://localhost:8317', apiKey:'', isEnabled:true},
            {id:'ep-secondary', name:'Fallback GPT', model:'gpt-image-2.5', baseUrl:'http://localhost:8317', apiKey:'', isEnabled:true}
          ]);
          storage.saveStoredRoutingConfig({mode:'failover', primaryEndpointId:'ep-primary', secondaryEndpointId:'ep-secondary'});
          localStorage.setItem('panorama_server_user_token','quality-fixture-token');
          window.userRefreshCount = 0;
          window.addEventListener('panorama-user-refresh', () => { window.userRefreshCount++; });
          window.fixtureProps = {...fixtureProps, currentUser:user, onPanoramaChange:url => {
            window.generatedPanorama = url;
          }};
          fixtureRender({});
        }""")
        calls = []
        def generate(route):
            calls.append(route.request.post_data_json)
            route.fulfill(status=422, content_type='application/json', body=json.dumps({
                'success': False,
                'code': 'GENERATION_QUALITY_REJECTED',
                'quality': {'status': 'failed', 'issues': ['collage'], 'reviewModel': 'gemini-3-flash', 'attempts': 2},
                'creditsDeducted': 0,
                'creditsRefunded': 4,
                'remainingCredits': 10,
            }))
        self.context.route('**/api/generate', generate)
        fixture.get_by_role('button', name='Generate (', exact=False).click()
        expect(fixture.get_by_role('alert')).to_contain_text('The panorama did not pass the AI quality check after one retry. Your credits were returned.')
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]['endpointId'], 'ep-primary')
        self.assertEqual(self.page.evaluate('typeof window.generatedPanorama'), 'undefined')
        self.assertEqual(self.page.evaluate('window.userRefreshCount'), 1)

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
                    expect(self.page.locator('a.button')).to_have_attribute('href', tool_path + '?lang=' + lang)
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
        expect(self.page).to_have_url(BASE_URL + '/cubemap-generator/?lang=ja')
        expect(self.page.locator('html')).to_have_attribute('lang', 'ja')
        expect(self.page.get_by_test_id('interface-language')).to_have_value('ja')
        expect(self.page.locator('h1')).to_contain_text('キューブマップ')
        self.page.goto(BASE_URL + '/ja/cubemap-generator/')
        self.page.get_by_role('link', name='English', exact=True).click()
        expect(self.page.get_by_test_id('interface-language')).to_have_value('en')
        expect(self.page.locator('html')).to_have_attribute('lang', 'en')

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
                expect(self.page).to_have_url(BASE_URL + tool_path + '?lang=zh')
                expect(self.page.locator('html')).to_have_attribute('lang', 'zh')
                expect(self.page.get_by_role('heading', level=1)).to_have_count(1)
        self.page.goto(BASE_URL + '/#pricing')
        expect(self.page.get_by_role('navigation', name='Language guides')).to_have_count(0)

    def test_interface_language_preserves_drafts_navigation_and_history(self):
        self.page.goto(BASE_URL + '/?source=language-test#generator')
        selector = self.page.get_by_test_id('interface-language')
        draft = self.page.locator('#prompt-input')
        draft.fill('Keep this scene exactly as typed')
        selector.select_option('es')
        expect(self.page.locator('html')).to_have_attribute('lang', 'es')
        expect(self.page).to_have_url(BASE_URL + '/?source=language-test&lang=es#generator')
        expect(draft).to_have_value('Keep this scene exactly as typed')
        expect(self.page.locator('link[rel=canonical]')).to_have_attribute('href', 'https://360panoramaviewer.com/')
        self.assertEqual(self.page.evaluate("localStorage.getItem('panorama_user_lang')"), 'es')
        selector.select_option('ja')
        expect(self.page.locator('html')).to_have_attribute('lang', 'ja')
        self.page.go_back()
        expect(selector).to_have_value('es')
        expect(self.page.locator('html')).to_have_attribute('lang', 'es')
        expect(draft).to_have_value('Keep this scene exactly as typed')
        self.page.locator('header a[href="/360-panorama-viewer/?lang=es"]').click()
        expect(self.page.locator('html')).to_have_attribute('lang', 'es')
        self.page.reload()
        expect(selector).to_have_value('es')
        selector.select_option('en')
        expect(self.page.locator('html')).to_have_attribute('lang', 'en')
        self.assertNotIn('lang=', self.page.url)

    def test_invalid_language_and_blocked_storage_have_safe_fallbacks(self):
        self.page.evaluate("localStorage.setItem('panorama_user_lang', 'es')")
        self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=invalid')
        expect(self.page.get_by_test_id('interface-language')).to_have_value('es')
        self.context.add_init_script("""for (const method of ['getItem', 'setItem']) {
          const original = Storage.prototype[method];
          Storage.prototype[method] = function(key, ...args) {
            if (key === 'panorama_user_lang') throw new DOMException('Blocked', 'SecurityError');
            return original.call(this, key, ...args);
          };
        }""")
        self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=de')
        expect(self.page.locator('html')).to_have_attribute('lang', 'de')
        self.page.get_by_test_id('interface-language').select_option('ja')
        expect(self.page.locator('html')).to_have_attribute('lang', 'ja')
        self.page.reload()
        expect(self.page.get_by_test_id('interface-language')).to_have_value('ja')

    def test_translated_core_tools_fit_mobile_and_desktop(self):
        routes = ['/', '/360-panorama-viewer/', '/cubemap-generator/', '/photo-to-globe/', '/photo-to-360-converter/']
        english_headings = {}
        for route in routes:
            self.page.goto(BASE_URL + route + '?lang=en')
            expect(self.page.get_by_test_id('interface-language')).to_have_value('en')
            heading = self.page.get_by_role('heading', level=1)
            expect(heading).to_have_count(1)
            english_headings[route] = heading.inner_text()
        for lang in ['zh', 'es', 'de', 'ja']:
            for width in [320, 1440]:
                self.page.set_viewport_size({'width': width, 'height': 900})
                for route in routes:
                    with self.subTest(lang=lang, width=width, route=route):
                        self.page.goto(BASE_URL + route + '?lang=' + lang)
                        selector = self.page.get_by_test_id('interface-language')
                        expect(selector).to_have_value(lang)
                        expect(self.page.locator('html')).to_have_attribute('lang', lang)
                        expect(self.page.get_by_role('heading', level=1)).to_have_count(1)
                        self.assertNotEqual(self.page.get_by_role('heading', level=1).inner_text(), english_headings[route])
                        self.page.wait_for_load_state('networkidle')
                        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), width)
                        box = selector.bounding_box()
                        self.assertGreaterEqual(box['x'], 0)
                        self.assertLessEqual(box['x'] + box['width'], width)

    def translated(self, dictionary, lang, text):
        return self.page.evaluate("""async ({dictionary, lang, text}) => {
          const module = await import(`/src/utils/${dictionary}Translations.ts`);
          const messages = Object.values(module).find(value => value?.en && value?.[lang]);
          if (!Object.hasOwn(messages[lang], text)) throw new Error(`Missing ${dictionary}/${lang}: ${text}`);
          return messages[lang][text];
        }""", {'dictionary': dictionary, 'lang': lang, 'text': text})

    def change_language(self, lang):
        self.page.get_by_test_id('interface-language').select_option(lang, force=True)
        expect(self.page.locator('html')).to_have_attribute('lang', lang)

    def test_specialist_pages_translate_and_fit_mobile(self):
        routes = ['/ai-hdri-generator/', '/cubemap-to-equirectangular/', '/hdri-viewer/',
                  '/360-metadata-injector/', '/skybox-generator/', '/text-to-panorama-ai/',
                  '/360-photo-to-video/', '/360-product-video-generator/', '/developers/', '/showcase/']
        headings = {}
        for route in routes:
            self.page.goto(BASE_URL + route + '?lang=en')
            heading = self.page.get_by_role('heading', level=1)
            expect(heading).to_have_count(1)
            headings[route] = heading.inner_text()
        for lang in ['zh', 'es', 'de', 'ja']:
            self.page.set_viewport_size({'width': 320 if lang == 'de' else 390, 'height': 900})
            for route in routes:
                with self.subTest(lang=lang, route=route):
                    self.page.goto(BASE_URL + route + '?lang=' + lang)
                    expect(self.page.get_by_test_id('interface-language')).to_have_value(lang)
                    self.page.wait_for_load_state('networkidle')
                    heading = self.page.get_by_role('heading', level=1)
                    expect(heading).to_have_count(1)
                    self.assertNotEqual(heading.inner_text(), headings[route])
                    links = self.page.locator('main a[href^="/"]').evaluate_all("els => els.map(el => el.getAttribute('href')).filter(href => !href.startsWith('/api/'))")
                    for href in links:
                        from urllib.parse import urlparse, parse_qs
                        self.assertEqual(parse_qs(urlparse(href).query).get('lang'), [lang], href)
                    self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), self.page.viewport_size['width'])

    def test_translated_checkout_preserves_choices_and_payment_payloads(self):
        config = {'enabled': True, 'mode': 'sandbox', 'plans': {
            'pro': {'monthly': {'amountCents': 990, 'credits': 120}, 'yearly': {'amountCents': 9900, 'credits': 1440}},
            'enterprise': {'monthly': {'amountCents': 2999, 'credits': 400}, 'yearly': {'amountCents': 29900, 'credits': 4800}}}}
        calls = []
        active = {'subscription': None}
        def paypal(route):
            name = route.request.url.rsplit('/', 1)[-1]
            if name == 'config': body = config
            elif name == 'subscription': body = active
            elif name == 'create-subscription':
                calls.append(route.request.post_data_json)
                body = {'approvalUrl': 'https://example.com/invalid-approval'}
            elif name == 'cancel-subscription':
                calls.append(route.request.post_data_json)
                active['subscription'] = {**active['subscription'], 'status': 'CANCELLED'}
                body = {'ok': True}
            else: raise AssertionError(name)
            route.fulfill(content_type='application/json', body=json.dumps(body))
        self.context.route('**/api/paypal/**', paypal)
        for lang in ['zh', 'es', 'de', 'ja']:
            self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=en')
            self.page.evaluate("localStorage.setItem('panorama_server_user_token', 'browser-fixture-token')")
            fixture = self.mount('commercial/CheckoutModal', {'isOpen': True, 'currentUser': {'id': 'usr_fixture', 'plan': 'free'}})
            dialog = fixture.locator('dialog')
            expect(dialog.locator('input[name=paypal-plan]').last).to_be_enabled()
            dialog.locator('input[name=paypal-plan]').last.check()
            dialog.locator('input[name=paypal-cycle]').last.check()
            self.change_language(lang)
            expect(dialog.locator('input[name=paypal-plan]').last).to_be_checked()
            expect(dialog.locator('input[name=paypal-cycle]').last).to_be_checked()
            expect(dialog).to_contain_text('$348.00 USD')
            dialog.get_by_role('button', name=self.translated('commerce', lang, 'Subscribe with PayPal'), exact=True).click()
            expect(dialog.get_by_role('alert')).to_have_text(self.translated('commerce', lang, 'Invalid PayPal approval URL'))
            self.assertEqual(calls[-1], {'plan': 'enterprise', 'billingCycle': 'yearly'})
            active['subscription'] = {'id': 'sub_fixture', 'paypalId': 'I-FIXTURE', 'plan': 'enterprise', 'billingCycle': 'yearly', 'status': 'ACTIVE', 'paidThrough': '2027-10-22T00:00:00Z', 'approvalUrl': ''}
            self.page.evaluate('fixtureRender({isOpen:false})')
            expect(dialog).to_have_count(0)
            self.page.evaluate('fixtureRender({isOpen:true})')
            cancel = fixture.get_by_role('button', name=self.translated('commerce', lang, 'Cancel automatic renewal'), exact=True)
            expect(cancel).to_be_enabled()
            previous = len(calls)
            self.page.once('dialog', lambda popup: popup.dismiss())
            cancel.click()
            self.assertEqual(len(calls), previous)
            self.page.once('dialog', lambda popup: popup.accept())
            cancel.click()
            expect(fixture.get_by_role('button', name=self.translated('commerce', lang, 'Subscribe with PayPal'), exact=True)).to_be_visible()
            self.assertEqual(calls[-1], {'subscriptionId': 'sub_fixture'})
            active['subscription'] = None

    def test_translated_sharing_keeps_user_title_and_link_language(self):
        shares = []
        def sharing(route):
            if route.request.method == 'POST':
                from urllib.parse import urlparse, parse_qs
                values = parse_qs(urlparse(route.request.url).query)
                shares.append(values)
                body = {'share': {'id': 'fixture-share', 'title': values['title'][0], 'width': 32, 'height': 16, 'allowDownload': True, 'listed': False, 'createdAt': 1790000000000}}
            else: body = {'shares': []}
            route.fulfill(content_type='application/json', body=json.dumps(body))
        self.context.route('**/api/shares*', sharing)
        for lang in ['zh', 'es', 'de', 'ja']:
            self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=en')
            self.page.evaluate("localStorage.setItem('panorama_server_user_token', 'browser-fixture-token')")
            fixture = self.mount('commercial/SharePanorama', {'isOpen': True, 'accountId': 'usr_fixture', 'prompt': 'Keep $& and <b> original'}, 'SharePanoramaModal')
            self.page.evaluate('fixtureRender({imageUrl:fixtureProps.textureUrl})')
            title = fixture.locator('input[maxlength="100"]')
            expect(title).to_have_value('Keep $& and <b> original')
            title.fill("My $& $' <b> panorama")
            self.change_language(lang)
            expect(title).to_have_value("My $& $' <b> panorama")
            fixture.get_by_role('button', name=self.translated('commerce', lang, 'Create share link'), exact=True).click()
            link = fixture.get_by_role('textbox', name=self.translated('commerce', lang, 'Newly created share link'), exact=True)
            expect(link).to_be_visible()
            self.assertEqual(shares[-1]['title'], ["My $& $' <b> panorama"])
            self.assertEqual(shares[-1]['listed'], ['0'])
            self.assertIn('lang=' + lang, link.input_value())
            expect(fixture.locator('b')).to_have_count(0)

    def test_translated_metadata_export_keeps_file_and_valid_xmp(self):
        for lang in ['zh', 'es', 'de', 'ja']:
            self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=en')
            fixture = self.mount('commercial/MetadataInjectorModal', {'isOpen': True})
            png = self.page.evaluate("fixtureProps.textureUrl.split(',')[1]")
            fixture.locator('input[type=file]').set_input_files({'name': 'my-$&-panorama.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(png)})
            expect(fixture.get_by_text('32 × 16', exact=False)).to_be_visible()
            self.change_language(lang)
            expect(fixture.get_by_text('32 × 16', exact=False)).to_be_visible()
            with self.page.expect_download() as downloaded:
                fixture.get_by_role('button', name=self.translated('specialist', lang, 'Inject PhotoSphere XMP & Download VR JPEG'), exact=True).click()
            self.assertEqual(downloaded.value.suggested_filename, 'my-$&-panorama-photosphere-360.jpg')
            with open(downloaded.value.path(), 'rb') as exported:
                data = exported.read()
            self.assertEqual(data[:2], b'\xff\xd8')
            from xml.etree import ElementTree
            xmp = ElementTree.fromstring(re.search(rb'<x:xmpmeta.*?</x:xmpmeta>', data, re.S).group(0))
            ns = {'GPano': 'http://ns.google.com/photos/1.0/panorama/'}
            self.assertEqual(xmp.findtext('.//GPano:ProjectionType', namespaces=ns), 'equirectangular')
            self.assertEqual(xmp.findtext('.//GPano:FullPanoWidthPixels', namespaces=ns), '32')
            expect(fixture.get_by_role('button', name=self.translated('specialist', lang, 'Metadata Injected & Downloaded! Click to Download Again'), exact=True)).to_be_enabled()

    def test_translated_video_error_keeps_export_options(self):
        for lang in ['zh', 'es', 'de', 'ja']:
            self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=en')
            fixture = self.mount('commercial/PhotoToVideoModal', {'isOpen': True})
            fixture.get_by_role('button', name='1:1 Square', exact=False).click()
            fixture.get_by_role('button', name='12s Loop', exact=True).click()
            checkbox = fixture.locator('input[type=checkbox]')
            checkbox.uncheck()
            self.change_language(lang)
            expect(checkbox).not_to_be_checked()
            expect(fixture).to_contain_text('12')
            # Fail both recorder constructor attempts; keep this a local error-path check.
            self.page.evaluate("""() => {
              window.MediaRecorder = class {
                static isTypeSupported() { return false; }
                constructor() { throw new Error('mock unsupported recorder'); }
              };
              window.alert = message => { window.recordingError = message; };
            }""")
            button = fixture.get_by_role('button', name=self.translated('advanced', lang, 'Render 360° Video'), exact=True)
            button.click()
            self.page.wait_for_function('window.recordingError !== undefined')
            self.assertEqual(self.page.evaluate('window.recordingError'), self.translated('advanced', lang, 'Video export failed. Please verify browser MediaRecorder support.'))
            expect(button).to_be_enabled()

    def test_embedded_viewer_and_hero_keep_language_without_recreating_webgl(self):
        self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=en')
        self.mount('HeroPanorama')
        canvas = self.page.locator('#regression-fixture canvas')
        expect(canvas).to_have_count(1)
        self.page.evaluate("window.originalHeroCanvas = document.querySelector('#regression-fixture canvas')")
        self.change_language('ja')
        expect(self.page.locator('.studio-hero-panorama-hint')).to_have_text(self.translated('shared', 'ja', 'DRAG TO LOOK AROUND · 360°'))
        self.assertTrue(self.page.evaluate("originalHeroCanvas === document.querySelector('#regression-fixture canvas')"))
        self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=ja')
        fixture = self.mount('commercial/EmbedModal', {'isOpen': True, 'currentPanoramaUrl': 'https://example.com/panorama.png?x=a&b=2'})
        code = fixture.locator('pre code').inner_text()
        import html
        from urllib.parse import urlparse, parse_qs
        source = html.unescape(re.search(r'src="([^"]+)"', code).group(1))
        query = parse_qs(urlparse(source).query)
        self.assertEqual(query['lang'], ['ja'])
        self.assertEqual(query['pano'], ['https://example.com/panorama.png?x=a&b=2'])
        self.assertIn(self.translated('generator', 'ja', 'Interactive 360° Scene powered by'), code)
        self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=ja')
        fixture = self.mount('commercial/EmbedViewer')
        expect(fixture.get_by_role('link')).to_have_attribute('href', 'https://360panoramaviewer.com/?lang=ja')

    def test_embed_code_responsive_ratios_and_share_privacy_translation(self):
        self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=en')
        fixture = self.mount('commercial/EmbedModal', {'isOpen': True, 'currentPanoramaUrl': 'https://example.com/pano.jpg'})
        for label, ratio in [('16:9', 16 / 9), ('4:3', 4 / 3)]:
            fixture.get_by_role('button', name=label, exact=True).click()
            code = fixture.locator('pre code').inner_text()
            for width in [320, 800]:
                measured = self.page.evaluate("""({code, width}) => {
                  const host = document.createElement('div');
                  host.style.width = width + 'px';
                  host.innerHTML = code;
                  const frame = host.querySelector('iframe');
                  frame.src = 'about:blank';
                  document.body.append(host);
                  const rect = frame.getBoundingClientRect();
                  host.remove();
                  return {width: rect.width, height: rect.height};
                }""", {'code': code, 'width': width})
                self.assertAlmostEqual(measured['width'], width, delta=1)
                self.assertAlmostEqual(measured['width'] / measured['height'], ratio, delta=0.01)
        self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=zh')
        fixture = self.mount('commercial/SharePanorama', {'isOpen': True, 'accountId': 'usr_guest'}, 'SharePanoramaModal')
        message = 'Viewing and local conversion run in your browser. AI generation sends references to the service; publishing a share uploads a sharing copy.'
        expected = self.translated('commerce', 'zh', message)
        expect(fixture.get_by_text(expected, exact=True)).to_be_visible()
        self.assertFalse(expected.startswith('。'))

    def test_cube_file_error_translates_without_changing_user_filename(self):
        self.page.goto(BASE_URL + '/360-panorama-viewer/?lang=en')
        fixture = self.mount('landing/CubemapToEquirectPage')
        filename = "bad-$&-file.png"
        fixture.locator('input[type=file]').first.set_input_files({'name': filename, 'mimeType': 'image/png', 'buffer': b'not an image'})
        expect(fixture.get_by_role('alert')).to_contain_text(filename)
        for lang in ['zh', 'es', 'de', 'ja']:
            self.change_language(lang)
            expected = self.translated('specialist', lang, '{name} is not an image a browser can decode. Use PNG, JPEG or WEBP faces.').replace('{name}', filename)
            expect(fixture.get_by_role('alert')).to_have_text(expected)
        expect(fixture.locator('b')).to_have_count(0)

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
