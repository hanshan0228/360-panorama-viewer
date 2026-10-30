# Six-item audit — 2026-10-25

Scope: the current panorama-generator source, both Node and Cloudflare APIs, Vite HTML entries and public assets. This is a local implementation audit, not a production or jurisdiction-wide compliance certification. Existing unrelated work was preserved. Owner decisions: public brand **360 Panorama Viewer**, contact **support@360panoramaviewer.com**, audience primarily US/Canada, minimum registration age **18**.

| Item | Evidence and result | Remaining boundary |
| --- | --- | --- |
| Registration age | Neutral birth-date step appears before email, name, password or Turnstile. Shared calendar validation checks 18+ again on both registration APIs, including legacy requests without `mode`. Invalid, future and underage dates cannot create accounts or send verification mail. Date of birth is not stored. A rejected browser retains a 24-hour registration block. | Self-declaration is an age screen, not verified identity. Clearing browser storage defeats the local retry block; a different client can lie about its age. Existing accounts are not retrospectively verified. Higher assurance requirements need a separate assessment. |
| Fonts | CSS already uses installed system fonts. Removed the only Google Fonts preconnects. Cloudflare `_headers` now enforces `font-src 'self'` for static responses. No font CDN or new font dependency is needed. | Verify the header and network requests on the custom domain after deployment; other hosting platforms must apply the equivalent header. |
| Session replay | No replay SDK, initialization or dependency found in source/package manifest. Google Analytics is present and is distinct from session replay. No fictitious replay setting or consent banner was added. | No access to remotely managed analytics settings was used. Audit GA linked tools, external marketing/tag accounts and production network activity separately. GA/cookie consent requirements remain outside this six-item replay finding. |
| Marketing emails | The only mail transport in this repository is Resend account verification (`server/emailVerification.mjs`), with a strictly account-service message and no promotional offer. There is no newsletter/campaign sender to patch. | No marketing-email compliance claim is made. Owner must provide a valid physical postal address and identify any external campaign platform before marketing can be enabled or approved. Email is not a postal address. |
| Subscription terms | Reused one disclosure beside pricing buttons and immediately before PayPal approval buttons: actual USD amount, monthly/yearly interval, automatic renewal until cancellation, first-charge review and cancellation route. Pending approvals use their stored order amount and cycle, not a later catalog price. Buttons reference the disclosure for assistive technology. | PayPal is still the approval/consent step. This patch does not add renewal reminder emails, consent-event retention or a complete refund/terms policy. |
| DMCA agent | Added a public copyright contact page and footer entry. It collects the information needed to identify a copyright complaint without claiming an agent is registered. Registration steps below. | Agent designation, payment, matching public agent contact details and an operational takedown/counter-notice process still require owner action. A website brand is not a substitute for the real provider identity. |

## Before any marketing send

Do not put offers into the verification template. Identify the actual campaign platform before implementing an unused mail subsystem. Each marketing message must include the real sender identity, a valid physical postal address and a clear working opt-out link. Keep suppression lists effective across campaigns; opting out must not require login, payment or extra personal information. US opt-outs must remain operable for at least 30 days and be honored within 10 business days. For Canada, obtain and retain an applicable consent basis; contact details and the unsubscribe facility must remain valid for at least 60 days, and opt-outs must be honored without delay and within 10 business days. Account creation and email verification do not themselves constitute express marketing consent.

The owner supplied a support email but has **not supplied a physical postal address**. An appropriately registered PO box or commercial mailbox may be usable for US marketing; confirm the actual address and Canadian requirements. Do not insert a fabricated address or a non-working unsubscribe URL. Audit any campaign already sent outside this repository separately.

## Register the DMCA agent

1. Open the [Copyright Office designated-agent directory](https://www.copyright.gov/dmca-directory/) and use its registration-system link to create an account. Use a monitored owner-controlled email.
2. Add the **service provider's actual full legal name** (company or individual, as applicable) and physical street address. Add **360 Panorama Viewer**, **360panoramaviewer.com**, **www.360panoramaviewer.com**, and other actual service names/domains as alternate names. A distinct legal entity needs its own designation. Do not register only a website name when it is merely a trading name.
3. Choose an agent: the owner, an authorized role such as “Copyright Agent”, or a professional agent service. Supply the agent's actual address, phone and monitored email. `support@360panoramaviewer.com` can be used if this mailbox works and is assigned to receive notices. Provider and agent addresses have different rules: do not assume a marketing-mail PO box can replace the provider street address; the Copyright Office describes a separate waiver process.
4. Pay the fee shown by the official system. The [current FAQ](https://www.copyright.gov/dmca-directory/faq.html) states **$6** for designation/amendment/resubmission. Save the accepted record and verify its public directory entry.
5. Update `/copyright/` to show the **same designated agent name, postal address, phone and email** as the accepted record. Verify both the deployed page and directory. Only then state that an agent is registered.
6. Renew within **three years** of registration or the latest accepted amendment/resubmission; track the actual expiry shown in the directory. Update changed information promptly. Set an owner calendar reminder well before expiry.
7. Operate the process: monitor the mailbox; evaluate notices, act expeditiously where appropriate, notify affected uploaders, handle valid counter-notices and repeat infringers, retain necessary records, and accommodate applicable standard technical measures. Designation alone does not establish every condition of a Section 512 safe harbor. Canadian copyright obligations are a separate assessment; US DMCA registration does not settle them.

Still needed from owner: real provider identity and street address; designated agent identity/address/phone; confirmation that the support mailbox receives mail. This audit did not submit registration or make a payment.

## Sources checked

- [FTC COPPA FAQ: neutral age screens and their limits](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions). The owner-selected 18+ policy is a product eligibility rule, not a claim that COPPA sets an 18-year threshold.
- [FTC CAN-SPAM business guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).
- [CRTC CASL FAQ](https://crtc.gc.ca/eng/com500/faq500.htm) and [Canadian consent guidance](https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en/getting-consent-send-email).
- [2026 Federal Register negative-option proceeding](https://www.govinfo.gov/content/pkg/FR-2026-03-13/html/2026-04952.htm): distinguishes ROSCA from the vacated 2024 amended rule. This audit does not rely on the vacated rule as current law.
- [Copyright Office DMCA FAQ](https://www.copyright.gov/dmca-directory/faq.html) and [Section 512 resources](https://www.copyright.gov/512/index.html).

## Verification

Completed against this candidate:

- `node --test tests/*.test.mjs`: **445 passed**, zero failures.
- `npm run lint`: passed without warnings.
- `npm run build`: passed; existing bundle-size advisory remains.
- Browser tests in `tests/email_verification_browser.py`: **3 passed** against the production build served by Vite preview, with isolated local email/verification services and mocked PayPal data. Checked adult registration and email verification; underage credential/captcha suppression and persistent retry block; monthly/yearly disclosure, original pending-order amount, 320/390/1440 px checkout layout and the copyright route. No real email, generation or payment was sent.
- Checked 48 source HTML files: no Google Fonts or Typekit endpoints. Built copyright page and `_headers` match source. `git diff --check` passed.

The sandbox initially denied loopback listeners; these tests passed after using permitted local execution. The installed default Playwright browser version was absent; tests used the already-installed Chromium executable. Vite dev uses SPA fallback for this public-directory page, so `/copyright/` was validated using the production preview, not that fallback.

For a rerun, build first, then use Vite preview on port 5173 and `node tests/email_browser_server.mjs` on port 3001; run `python3 tests/email_verification_browser.py`. If needed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed compatible browser. Verify the static CSP header on Cloudflare after deployment; Vite preview does not apply Cloudflare `_headers`.

This patch was **not deployed**. No production behavior, remote analytics configuration, support-mail delivery or DMCA registration was verified.
