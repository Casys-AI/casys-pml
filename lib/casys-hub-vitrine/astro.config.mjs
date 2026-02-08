// @ts-check
import mdx from '@astrojs/mdx';
import preact from '@astrojs/preact';
import starlight from '@astrojs/starlight';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  // Déploiement Vercel (autorise SSR si nécessaire, majoritairement statique)
  adapter: vercel(),

  // i18n: anglais par défaut, français en préfixe (/fr)
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'zh'],
  },

  integrations: [
    starlight({
      title: 'Casys Docs',
      description: 'Documentation for Casys open-source packages: @casys/mcp-server and @casys/shgat.',
      logo: {
        light: './src/assets/casys-logo-light.svg',
        dark: './src/assets/casys-logo-dark.svg',
        replacesTitle: false,
      },
      customCss: ['./src/styles/starlight-custom.css'],
      head: [
        {
          tag: 'script',
          content: `
(function() {
  var keep = { 'engine.casys.ai': '@casys/shgat', 'mcp-server.casys.ai': '@casys/mcp-server' };
  var titles = { 'engine.casys.ai': 'SHGAT Docs', 'mcp-server.casys.ai': 'MCP Server Docs' };
  var h = location.hostname;
  var target = keep[h];
  var items = document.querySelectorAll('.top-level > li');
  if (!target) {
    document.documentElement.setAttribute('data-sidebar-ready', '');
    return;
  }
  items.forEach(function(li) {
    var label = li.querySelector('.group-label .large');
    if (!label) return;
    if (label.textContent.trim() === target) {
      var det = li.querySelector(':scope > details');
      if (det) det.open = true;
    } else {
      li.hidden = true;
    }
  });
  document.documentElement.setAttribute('data-sidebar-ready', '');
  var titleSpan = document.querySelector('.site-title [translate="no"]');
  if (titleSpan && titles[h]) titleSpan.textContent = titles[h];
  if (titles[h]) document.title = document.title.replace(/\\| Casys Docs$/, '| ' + titles[h]);
})();
`,
        },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Casys-AI' },
      ],
      sidebar: [
        {
          label: '@casys/mcp-server',
          collapsed: false,
          items: [
            {
              label: 'Getting Started',
              items: [
                { label: 'Introduction', slug: 'docs/getting-started/introduction' },
                { label: 'Installation', slug: 'docs/getting-started/installation' },
                { label: 'Quick Start', slug: 'docs/getting-started/quickstart' },
              ],
            },
            {
              label: 'Guides',
              items: [
                { label: 'Middleware Pipeline', slug: 'docs/guides/middleware' },
                { label: 'Authentication (OAuth2)', slug: 'docs/guides/auth' },
                { label: 'Configuration (YAML)', slug: 'docs/guides/configuration' },
                { label: 'MCP Apps (UI Resources)', slug: 'docs/guides/mcp-apps' },
              ],
            },
            {
              label: 'API Reference',
              items: [
                { label: 'ConcurrentMCPServer', slug: 'docs/api/concurrent-mcp-server' },
                { label: 'Auth Providers', slug: 'docs/api/auth-providers' },
                { label: 'Standalone Components', slug: 'docs/api/standalone-components' },
              ],
            },
          ],
        },
        {
          label: '@casys/shgat',
          collapsed: false,
          items: [
            {
              label: 'Getting Started',
              items: [
                { label: 'Introduction', slug: 'docs/shgat/introduction' },
                { label: 'Installation', slug: 'docs/shgat/installation' },
                { label: 'Quick Start', slug: 'docs/shgat/quickstart' },
              ],
            },
            {
              label: 'Guides',
              items: [
                { label: 'Architecture', slug: 'docs/shgat/architecture' },
                { label: 'Training', slug: 'docs/shgat/training' },
                { label: 'Persistence', slug: 'docs/shgat/persistence' },
              ],
            },
            {
              label: 'API Reference',
              items: [
                { label: 'SHGAT Class', slug: 'docs/shgat/api-shgat' },
                { label: 'Graph & TensorFlow', slug: 'docs/shgat/api-graph-tf' },
              ],
            },
          ],
        },
      ],
    }),
    mdx({
      // Configuration MDX pour Astro
      extendMarkdownConfig: true,
    }),
    preact({ include: ['**/islands/catalog/**'] }),
    icon()
  ],

  // Configuration pour les articles MDX
  markdown: {
    // Activer la coloration syntaxique
    syntaxHighlight: {
      type: 'shiki',
      excludeLangs: ['mermaid', 'math'],
    },
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
    // Mermaid est géré par l'intégration @astrojs/mermaid
  },

  vite: {
    clearScreen: false, // Ne pas nettoyer l'écran pour conserver l'historique des logs
    define: {
      // Expose CASYS_API_URL au client (aligné avec .env racine)
      'import.meta.env.CASYS_API_URL': JSON.stringify(process.env.CASYS_API_URL ?? 'http://localhost:3003'),
    },
    resolve: {
      alias: {
        '~': new URL('./src', import.meta.url).pathname,
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          // Allow SCSS @use to resolve from src/styles directory
          includePaths: [new URL('./src/styles', import.meta.url).pathname],
        },
      },
    },
    // Proxy API calls to backend during development
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3003',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  },
});