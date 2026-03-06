export const DEFAULT_SITE_URL = 'https://casys.ai';

export const LOCALES = ['en', 'fr', 'zh', 'zh-TW'] as const;
export type Locale = (typeof LOCALES)[number];

const LOCALE_PREFIXES: Record<Locale, string> = {
  en: '',
  fr: '/fr',
  zh: '/zh',
  'zh-TW': '/zh-TW',
};

const SUBSITE_ORIGINS = [
  { prefix: '/mcp-server', origin: 'https://mcp-server.casys.ai' },
  { prefix: '/mcp-std', origin: 'https://mcp-std.casys.ai' },
  { prefix: '/mcp-bridge', origin: 'https://mcp-bridge.casys.ai' },
  { prefix: '/engine', origin: 'https://engine.casys.ai' },
] as const;

type LocaleSplit = {
  locale: Locale;
  pathWithoutLocale: string;
};

type PublicRoute = {
  origin: string;
  publicPath: string;
  canonicalUrl: string;
};

function normalizeOrigin(siteUrl?: string): string {
  const base = (siteUrl || DEFAULT_SITE_URL).trim();
  return base.replace(/\/+$/, '');
}

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return '/';
  }

  let normalized = pathname.trim();
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  if (normalized !== '/') {
    normalized = normalized.replace(/\/+$/, '');
  }

  return normalized || '/';
}

function splitLocale(pathname: string): LocaleSplit {
  const normalized = normalizePathname(pathname);

  for (const locale of ['zh-TW', 'fr', 'zh'] as const) {
    const prefix = LOCALE_PREFIXES[locale];
    if (normalized === prefix) {
      return { locale, pathWithoutLocale: '/' };
    }
    if (normalized.startsWith(`${prefix}/`)) {
      return {
        locale,
        pathWithoutLocale: normalized.slice(prefix.length) || '/',
      };
    }
  }

  return {
    locale: 'en',
    pathWithoutLocale: normalized,
  };
}

function buildLocalizedPath(locale: Locale, pathWithoutLocale: string): string {
  const normalized = normalizePathname(pathWithoutLocale);
  const prefix = LOCALE_PREFIXES[locale];

  if (normalized === '/') {
    return prefix ? `${prefix}/` : '/';
  }

  return `${prefix}${normalized}`;
}

function resolveOriginAndPath(pathWithoutLocale: string, siteUrl?: string): { origin: string; publicPathWithoutLocale: string } {
  const normalized = normalizePathname(pathWithoutLocale);

  for (const subsite of SUBSITE_ORIGINS) {
    if (normalized === subsite.prefix) {
      return {
        origin: subsite.origin,
        publicPathWithoutLocale: '/',
      };
    }

    if (normalized.startsWith(`${subsite.prefix}/`)) {
      return {
        origin: subsite.origin,
        publicPathWithoutLocale: normalized.slice(subsite.prefix.length) || '/',
      };
    }
  }

  return {
    origin: normalizeOrigin(siteUrl),
    publicPathWithoutLocale: normalized,
  };
}

export function resolvePublicUrl(pathname: string, siteUrl?: string): PublicRoute {
  const { locale, pathWithoutLocale } = splitLocale(pathname);
  const { origin, publicPathWithoutLocale } = resolveOriginAndPath(pathWithoutLocale, siteUrl);
  const publicPath = buildLocalizedPath(locale, publicPathWithoutLocale);

  return {
    origin,
    publicPath,
    canonicalUrl: new URL(publicPath, origin).toString(),
  };
}

export function buildPublicUrl(pathname: string, locale: Locale, siteUrl?: string): string {
  const { pathWithoutLocale } = splitLocale(pathname);
  const { origin, publicPathWithoutLocale } = resolveOriginAndPath(pathWithoutLocale, siteUrl);
  const publicPath = buildLocalizedPath(locale, publicPathWithoutLocale);
  return new URL(publicPath, origin).toString();
}
