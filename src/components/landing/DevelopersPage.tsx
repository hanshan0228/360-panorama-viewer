import { useLanguage, useTranslation, withLanguageHref } from '../../utils/i18n';
import { advancedTranslations } from '../../utils/advancedTranslations';
import { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Code2,
  ExternalLink,
  Link2,
  Lock,
  Server,
  Terminal,
} from 'lucide-react';
import type { ActiveTab } from '../../types/panorama';

interface DevelopersPageProps {
  onNavigateTab: (tab: ActiveTab, pushPath?: string) => void;
}

const EMBED_SNIPPET = [
  '<div style="position:relative;width:100%;overflow:hidden;border-radius:16px;">',
  '  <iframe',
  '    src="https://360panoramaviewer.com/?embed=true&autorotate=1&pano=https://example.com/my-panorama.jpg#embed"',
  '    width="100%" height="500px" style="border:none;display:block;"',
  '    allow="accelerometer; gyroscope; vr; fullscreen"',
  '    allowfullscreen="true" loading="lazy"></iframe>',
  '</div>',
].join('\n');

const CURL_SNIPPET = [
  '# 1. Register and verify your email on the website, then sign in for a bearer token',
  `curl -X POST https://360panoramaviewer.com/api/user/auth -H "Content-Type: application/json" -d '{"mode":"login","email":"you@example.com","password":"<password>"}'`,
  '',
  '# 2. Read the public showcase feed (no auth, CORS enabled)',
  'curl "https://360panoramaviewer.com/api/shares?public=1"',
  '',
  '# 3. Publish a panorama (PNG/JPEG body, bearer token from step 1)',
  'curl -X POST "https://360panoramaviewer.com/api/shares?title=My%20rooftop&listed=1" \\',
  '  -H "Authorization: Bearer <token>" -H "Content-Type: image/jpeg" \\',
  '  --data-binary @panorama-4096x2048.jpg',
].join('\n');

const ENDPOINTS: Array<{ method: string; path: string; auth: string; description: string }> = [
  { method: 'GET', path: '/api/health', auth: 'None', description: 'Service status plus database and payment gateway readiness.' },
  { method: 'GET', path: '/api/billing', auth: 'None', description: 'Public plan configuration: trial credits, prices and billing cycle.' },
  { method: 'GET', path: '/api/models', auth: 'None', description: 'Available image models and routing configuration, with all API keys stripped.' },
  { method: 'GET', path: '/api/user/auth-config', auth: 'None', description: 'Registration availability and public Turnstile site key.' },
  { method: 'POST', path: '/api/user/auth', auth: 'None', description: 'Sign in with email and password for a session token. New registrations also require Turnstile and email verification before trial use.' },
  { method: 'GET', path: '/api/user/me', auth: 'Bearer', description: 'Current user, plan and remaining credit balance.' },
  { method: 'POST', path: '/api/generate', auth: 'Bearer', description: 'Generate a 2:1 equirectangular panorama from a prompt at 1K, 2K or 4K.' },
  { method: 'GET', path: '/api/shares?public=1', auth: 'None', description: 'Listed panoramas only, newest first, for showcase and gallery embeds.' },
  { method: 'GET', path: '/api/shares/{id}', auth: 'None', description: 'Metadata for one shared panorama: title, pixel size, download and listing flags.' },
  { method: 'GET', path: '/api/shares/{id}/image', auth: 'None', description: 'The panorama bytes as PNG or JPEG — safe to use directly as a texture or embed source.' },
  { method: 'GET', path: '/api/shares/{id}/download', auth: 'None', description: 'Same image with a Content-Disposition attachment header (403 if the author disabled downloads).' },
  { method: 'POST', path: '/api/shares', auth: 'Bearer', description: 'Publish a panorama. Query: title, listed=1 for the public showcase, allowDownload=0 to disable downloads.' },
  { method: 'POST', path: '/api/shares/{id}', auth: 'Bearer', description: 'Update a share: listed, allowDownload, or revoke the link entirely.' },
  { method: 'GET', path: '/api/shares', auth: 'Bearer', description: 'Your own shares, including unlisted links and revocation state.' },
];

const EMBED_PARAMS: Array<{ param: string; value: string; description: string }> = [
  { param: 'embed', value: 'true', description: 'Switches the page into full-viewport viewer mode: the scene plus a small branding badge, nothing else.' },
  { param: 'pano', value: 'https://.../image.jpg', description: 'Public HTTPS URL of the equirectangular image. Our own /api/shares/{id}/image links work directly.' },
  { param: 'autorotate', value: '1', description: 'Starts a slow automatic camera rotation that stops as soon as the visitor drags the scene.' },
  { param: '#embed', value: '-', description: 'Hash form of the embed switch, for hosts that strip query strings from iframes.' },
];

export function DevelopersPage({ onNavigateTab }: DevelopersPageProps) {
  const t = useTranslation(advancedTranslations);
  const [lang] = useLanguage();
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Can I embed a 360 panorama on my own website for free?',
      a: 'Yes. The embed is an iframe pointing at the viewer with ?embed=true, so it works on any host that can render HTML: WordPress, Webflow, Shopify, Squarespace, a GitHub README, or a plain static page. No API key and no account are required for viewing.',
    },
    {
      q: 'Which image URL can I pass to the pano parameter?',
      a: 'Any publicly reachable HTTPS image in 2:1 equirectangular projection that can be loaded cross-origin. If the panorama was published through the share API, use the /api/shares/{id}/image link, which is already CORS-friendly and stays valid while the share is active.',
    },
    {
      q: 'Do I need a server to use the API?',
      a: 'No. The endpoints are plain JSON over HTTPS and the read-only ones need no authentication, so a static site, a Cloudflare Worker, a serverless function, or a local script can call them directly.',
    },
    {
      q: 'How does the API authenticate private calls?',
      a: 'Send the session token from POST /api/user/auth as an Authorization: Bearer header. Guests cannot generate images. Free generation requires a registered account with a verified email; starter credits are granted once, subject to network and daily limits.',
    },
    {
      q: 'Are there rate limits?',
      a: 'Yes, and they are generous for normal use: share reads are limited per hour and per day, publishing is limited to a handful of new links per day with a 100 MB personal quota, and generation is limited by daily credits and concurrent requests.',
    },
    {
      q: 'Can I call this API from an AI agent or an MCP server?',
      a: 'Yes. Every endpoint is standard JSON over HTTPS with no SDK requirement, which is what an agent tool wrapper needs: POST /api/generate to create a scene, GET /api/shares?public=1 to list examples, and /api/shares/{id}/image as a texture URL the agent can hand to other tools.',
    },
    {
      q: 'Is the viewer open source or self-hostable?',
      a: 'The rendering core is the standard Three.js equirectangular approach: one inverted sphere, a 2:1 texture, and pointer controls. This page documents the hosted embed and API; the same layout can be reproduced in your own build if you prefer to self-host the front end.',
    },
    {
      q: 'What response format do the endpoints return?',
      a: 'UTF-8 JSON for metadata and binary image bytes for /image and /download. Errors use standard HTTP status codes: 400 for invalid input, 401 for missing tokens, 403 for disabled downloads, 415 for unsupported upload types, 429 for rate limits, and 503 while an upload is still propagating.',
    },
  ];

  const related = [
    { label: '360 Panorama Viewer', note: 'The page the embed loads', href: '/360-panorama-viewer/', tab: 'viewer' as ActiveTab },
    { label: '360 Panorama Showcase', note: 'The public shares feed, rendered live', href: '/showcase/', tab: 'showcase' as ActiveTab },
    { label: 'Text to Panorama AI', note: 'Generate scenes for the API to serve', href: '/text-to-panorama-ai/', tab: 'landing-text2pano' as ActiveTab },
    { label: 'Cubemap Generator', note: 'Produce six engine faces from one image', href: '/cubemap-generator/', tab: 'landing-cubemap' as ActiveTab },
    { label: 'PhotoSphere Metadata Injector', note: 'Prepare files for Facebook and Street View', href: '/360-metadata-injector/', tab: 'landing-metadata' as ActiveTab },
    { label: 'Pricing and Credit Plans', note: 'Credits and commercial licensing', href: '/#pricing', tab: 'pricing' as ActiveTab },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-cyan-400/70 pt-2">
        <a href={withLanguageHref("/", lang)} className="hover:text-cyan-300 transition-colors">{t("Home")}</a>
        <span>/</span>
        <span className="text-white font-medium">{t("Developers")}</span>
      </nav>

      {/* Hero */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("EMBED • REST API • JSON OVER HTTPS")}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            {t("Developer Docs:")}{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
              {t("Embed a 360° Panorama or Call the API")}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            {t("Drop an interactive 360° viewer into any page with a single iframe, or drive the platform from your own code: generate equirectangular panoramas, publish them, and read them back as JSON or image bytes. No SDK, and no API key for reads.")}
          </p>

          <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-teal-400" />
              <span>{t("One-line embed, no account needed")}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Server className="w-4 h-4 text-teal-400" />
              <span>{t("Edge-hosted JSON API with CORS enabled")}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-teal-400" />
              <span>{t("Bearer tokens for private calls")}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Embed */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Quick Start")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Embed a 360° Panorama with One iframe")}
          </h2>
          <p className="text-xs text-cyan-200/70">
            {t("Point the viewer at a public equirectangular image. The page switches to full-viewport mode, so the iframe shows the scene only — no navigation, no header.")}
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-4">
          <pre className="rounded-2xl border border-cyan-500/25 bg-[#02070f] p-4 overflow-x-auto text-[11px] leading-relaxed text-cyan-100/90">
            <code>{EMBED_SNIPPET}</code>
          </pre>

          <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-5">{t("Parameter")}</th>
                  <th className="py-3.5 px-5">{t("Value")}</th>
                  <th className="py-3.5 px-5">{t("What it does")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
                {EMBED_PARAMS.map(row => (
                  <tr key={row.param}>
                    <td className="py-3.5 px-5 font-mono font-bold text-teal-300">{row.param}</td>
                    <td className="py-3.5 px-5 font-mono text-cyan-200/80">{row.value}</td>
                    <td className="py-3.5 px-5">{t(row.description)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* API reference */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            REST API
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Endpoints on 360panoramaviewer.com")}
          </h2>
          <p className="text-xs text-cyan-200/70">
            {t("Every route returns JSON unless noted, sends")}{' '}
            <code className="text-cyan-300">Access-Control-Allow-Origin: *</code>{t(", and answers")}{' '}
            <code className="text-cyan-300">OPTIONS</code> {t("preflights for browser clients.")}
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-5">{t("Method")}</th>
                <th className="py-3.5 px-5">{t("Path")}</th>
                <th className="py-3.5 px-5">{t("Auth")}</th>
                <th className="py-3.5 px-5">{t("Description")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              {ENDPOINTS.map(row => (
                <tr key={`${row.method} ${row.path}`}>
                  <td className="py-3.5 px-5 font-mono font-bold text-teal-300">{row.method}</td>
                  <td className="py-3.5 px-5 font-mono text-cyan-200/90">{row.path}</td>
                  <td className="py-3.5 px-5 text-cyan-300/80">{t(row.auth)}</td>
                  <td className="py-3.5 px-5">{t(row.description)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Examples */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Copy & Paste")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Working curl Examples")}
          </h2>
        </div>

        <div className="max-w-4xl mx-auto space-y-4">
          <pre className="rounded-2xl border border-cyan-500/25 bg-[#02070f] p-4 overflow-x-auto text-[11px] leading-relaxed text-cyan-100/90">
            <code>{CURL_SNIPPET}</code>
          </pre>

          <div className="flex flex-col sm:flex-row items-start gap-4 rounded-2xl border border-cyan-500/25 bg-[#05142b]/70 p-5">
            <Terminal className="w-5 h-5 text-cyan-400 shrink-0" />
            <div className="space-y-2 text-xs text-cyan-100/80 leading-relaxed">
              <p>
                <strong className="text-white">{t("Response shapes.")}</strong> {t("A successful sign-in answers with")}{' '}
                <code className="text-cyan-300">{'{ token, user: { id, creditsBalance } }'}</code>{t("; the public showcase answers with")}{' '}
                <code className="text-cyan-300">{'{ shares: [{ id, title, width, height, createdAt }] }'}</code>{t("; publishing answers with")} <code className="text-cyan-300">201</code> {t("and the new share id.")}
              </p>
              <p>
                <strong className="text-white">{t("Building an AI agent?")}</strong> {t("These are ordinary JSON endpoints, so any tool wrapper — including an MCP server you host yourself — can call")} <code className="text-cyan-300">/api/generate</code> {t("to create a scene and then pass")}{' '}
                <code className="text-cyan-300">/api/shares/&#123;id&#125;/image</code> {t("to other tools as a plain image URL.")}
              </p>
            </div>
          </div>

          <a
            href={withLanguageHref("/showcase/", lang)}
            onClick={(e) => { e.preventDefault(); onNavigateTab('showcase', '/showcase/'); }}
            className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>{t("See the public shares feed rendered live in the showcase")}</span>
          </a>
        </div>
      </section>

      <p className="text-sm text-cyan-100/80">
        <a href="/blog/panorama-to-skybox-threejs-unity/" hrefLang="en" className="text-cyan-300 underline">{t("Skybox tutorial: sample files, Three.js and Unity (English)")}</a>
      </p>

      {/* FAQ */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Frequently Asked Questions")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Embed & API Questions")}
          </h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div key={t(faq.q)} className="rounded-xl border border-cyan-500/25 bg-[#030e20] overflow-hidden transition-colors">
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full py-4 px-5 text-left flex items-center justify-between gap-4 font-semibold text-sm text-white hover:text-cyan-300 cursor-pointer transition-colors"
                >
                  <span>{t(faq.q)}</span>
                  <ChevronDown className={`w-4 h-4 text-cyan-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs text-cyan-100/80 leading-relaxed border-t border-cyan-500/15 pt-3">
                    {t(faq.a)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Related */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Where to Point It")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Tools & Pages Behind the API")}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {related.map(tool => (
            <a
              key={tool.href}
              href={withLanguageHref(tool.href, lang)}
              onClick={(e) => { e.preventDefault(); onNavigateTab(tool.tab, tool.href); }}
              className="group rounded-2xl border border-cyan-500/25 bg-[#05142b]/70 p-5 hover:border-cyan-400/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>{t(tool.label)}</span>
              </div>
              <p className="text-xs text-cyan-200/70 pt-1.5">{t(tool.note)}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
