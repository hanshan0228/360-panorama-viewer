import { useEffect, useSyncExternalStore } from 'react';

export type SupportedLang = 'en' | 'zh' | 'es' | 'de' | 'ja';
export type TranslationMessages = Record<SupportedLang, Record<string, string>>;

export const LANGUAGES: { code: SupportedLang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '简体中文' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ja', name: '日本語' },
];

const LANG_STORAGE_KEY = 'panorama_user_lang';
const isLanguage = (value: unknown): value is SupportedLang =>
  typeof value === 'string' && ['en', 'zh', 'es', 'de', 'ja'].includes(value);

export function getStoredLanguage(): SupportedLang {
  if (typeof window === 'undefined') return 'en';
  const query = new URLSearchParams(window.location.search).get('lang');
  if (isLanguage(query)) return query;
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch { /* Storage can be disabled in private or embedded browsing. */ }
  return 'en';
}

let language = getStoredLanguage();
const listeners = new Set<() => void>();

function persistLanguage(lang: SupportedLang) {
  try { window.localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* Keep the in-memory selection. */ }
  document.documentElement.lang = lang;
}

function notifyLanguage(lang: SupportedLang) {
  language = lang;
  persistLanguage(lang);
  listeners.forEach(listener => listener());
}

export function saveStoredLanguage(lang: SupportedLang): void {
  if (typeof window === 'undefined' || !isLanguage(lang)) return;
  const url = new URL(window.location.href);
  if (lang === 'en') url.searchParams.delete('lang');
  else url.searchParams.set('lang', lang);
  if (url.href !== window.location.href) window.history.pushState(null, '', url);
  notifyLanguage(lang);
}

function onPopState() {
  // A history entry without lang is English, even when storage holds a later selection.
  const query = new URLSearchParams(window.location.search).get('lang');
  notifyLanguage(isLanguage(query) ? query : 'en');
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('popstate', onPopState);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('popstate', onPopState);
  };
}

export function useLanguage(): [SupportedLang, (lang: SupportedLang) => void] {
  const lang = useSyncExternalStore(subscribe, () => language, () => 'en' as SupportedLang);
  useEffect(() => {
    persistLanguage(lang);
    // Make a remembered selection explicit so reloads and history retain its language.
    const url = new URL(window.location.href);
    if (lang === 'en') url.searchParams.delete('lang');
    else url.searchParams.set('lang', lang);
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
  }, [lang]);
  return [lang, saveStoredLanguage];
}

export function withLanguageHref(href: string, lang: SupportedLang): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const url = new URL(href, 'https://360panoramaviewer.com');
  if (lang === 'en') url.searchParams.delete('lang');
  else url.searchParams.set('lang', lang);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function useTranslation(messages: TranslationMessages): (text: string) => string {
  const [lang] = useLanguage();
  // ponytail: untranslated messages retain their source English until a dictionary entry is added.
  return text => Object.hasOwn(messages[lang], text) ? messages[lang][text] : text;
}
