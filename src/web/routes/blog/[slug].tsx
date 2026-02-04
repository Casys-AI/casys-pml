// @ts-nocheck
import { HttpError, page } from "fresh";
import { Head } from "fresh/runtime";
import { PRISM_THEME_CSS } from "../../utils/prism-theme.ts";
import { formatDate, getPost, type Post } from "../../utils/posts.ts";
import ArchitectureDiagram from "../../components/ArchitectureDiagram.tsx";
import { GoogleAnalytics } from "../../components/GoogleAnalytics.tsx";
import MobileMenu from "../../islands/MobileMenu.tsx";

export const handler = {
  async GET(ctx: any) {
    try {
      const slug = ctx.params.slug;
      const post = await getPost(slug);

      if (!post) {
        throw new HttpError(404, "Post not found");
      }

      return page({ post });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      console.error(`Error loading post ${ctx.params.slug}:`, error);
      throw new HttpError(500, "Internal server error");
    }
  },
};

export default function BlogPost({ data }: { data: { post: Post } }) {
  const { post } = data;

  return (
    <>
      <GoogleAnalytics />
      <Head>
        <title>{post.title} - Casys PML Blog</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={post.snippet} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.snippet} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content={`https://pml.casys.ai/assets/og/${post.slug}.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content={`https://pml.casys.ai/blog/${post.slug}`} />
        <meta property="og:site_name" content="Casys PML" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.snippet} />
        <meta name="twitter:image" content={`https://pml.casys.ai/assets/og/${post.slug}.png`} />
        <meta property="article:published_time" content={post.date.toISOString()} />
        <meta property="article:author" content={post.author} />
        {post.tags.map((tag) => <meta property="article:tag" content={tag} key={tag} />)}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <style>{`html,body{background:#0a0908;margin:0}`}</style>
        <style dangerouslySetInnerHTML={{ __html: PRISM_THEME_CSS }} />
      </Head>

      <div class="min-h-screen bg-pml-bg text-pml-text font-[var(--font-sans)] flex flex-col overflow-x-hidden">
        <div class="reading-progress fixed top-0 left-0 h-[3px] bg-gradient-to-r from-pml-accent to-violet-400 w-0 z-[1000] transition-[width] duration-100 ease-out" id="reading-progress"></div>

        <header class="sticky top-0 z-100 px-4 py-4 md:px-8 bg-[rgba(10,9,8,0.9)] backdrop-blur-[20px] border-b border-pml-border">
          <div class="max-w-[1200px] mx-auto flex justify-between items-center">
            <a href="/" class="flex items-center gap-4 no-underline">
              <span class="font-[var(--font-display)] text-2xl text-pml-accent">Casys PML</span>
              <span class="hidden md:inline text-xs text-pml-text-dim tracking-[0.1em] uppercase">Procedural Memory Layer</span>
            </a>
            <nav class="flex items-center gap-3 md:gap-8">
              <a href="/" class="hidden md:inline text-pml-text-muted no-underline text-sm font-medium transition-colors duration-200 hover:text-pml-accent">Home</a>
              <a href="/docs" class="hidden md:inline text-pml-text-muted no-underline text-sm font-medium transition-colors duration-200 hover:text-pml-accent">Docs</a>
              <a href="/blog" class="hidden md:inline text-pml-accent no-underline text-sm font-medium transition-colors duration-200">Blog</a>
              <MobileMenu />
            </nav>
          </div>
        </header>

        <main class="flex-1 px-4 py-8 md:px-8 md:py-16">
          <article class="max-w-[720px] mx-auto">
            <header class="mb-12 pb-8 border-b border-pml-border">
              <a href="/blog" class="inline-block text-pml-text-muted no-underline text-sm mb-8 transition-colors duration-200 hover:text-pml-accent">← Back to Blog</a>
              <div class="flex items-center gap-2 md:gap-4 mb-6 flex-wrap">
                <span class="font-[var(--font-mono)] text-[0.7rem] text-pml-accent uppercase tracking-[0.1em] py-1 px-3 bg-pml-accent-dim rounded">{post.category}</span>
                <time class="text-sm text-pml-text-dim">{formatDate(post.date)}</time>
                <span class="text-sm text-pml-text-dim">by {post.author}</span>
              </div>
              <h1 class="font-[var(--font-display)] text-3xl md:text-[2.5rem] font-normal leading-[1.2] mb-4">{post.title}</h1>
              <p class="text-lg md:text-xl text-pml-text-muted leading-relaxed mb-6">{post.snippet}</p>
              <div class="flex gap-3 flex-wrap">
                {post.tags.map((tag) => <span class="font-[var(--font-mono)] text-[0.8rem] text-pml-text-dim" key={tag}>#{tag}</span>)}
              </div>
            </header>

            <div class="markdown-body article-content">
              {post.html.split("<!-- component: ArchitectureDiagram -->").map((
                part,
                index,
                array,
              ) => (
                <>
                  <div dangerouslySetInnerHTML={{ __html: part }} />
                  {index < array.length - 1 && (
                    <div class="h-[400px] my-8 border border-pml-border rounded-xl bg-pml-bg-elevated overflow-hidden">
                      <ArchitectureDiagram />
                    </div>
                  )}
                </>
              ))}
            </div>

            <footer class="mt-12 pt-8 border-t border-pml-border">
              <div class="mb-8">
                <span class="block text-sm text-pml-text-dim mb-3">Share this article:</span>
                <div class="flex gap-4">
                  <a
                    href={`https://twitter.com/intent/tweet?text=${
                      encodeURIComponent(post.title)
                    }&url=${encodeURIComponent(`https://pml.casys.ai/blog/${post.slug}`)}`}
                    target="_blank"
                    rel="noopener"
                    class="py-2 px-4 bg-pml-bg-elevated border border-pml-border rounded-md text-pml-text-muted no-underline text-sm transition-all duration-200 hover:border-pml-accent hover:text-pml-accent"
                  >
                    Twitter
                  </a>
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${
                      encodeURIComponent(`https://pml.casys.ai/blog/${post.slug}`)
                    }`}
                    target="_blank"
                    rel="noopener"
                    class="py-2 px-4 bg-pml-bg-elevated border border-pml-border rounded-md text-pml-text-muted no-underline text-sm transition-all duration-200 hover:border-pml-accent hover:text-pml-accent"
                  >
                    LinkedIn
                  </a>
                </div>
              </div>
              <a href="/blog" class="inline-block text-pml-text-muted no-underline text-sm transition-colors duration-200 hover:text-pml-accent">← Back to all posts</a>
            </footer>
          </article>
        </main>

        <footer class="p-4 md:p-8 border-t border-pml-border">
          <div class="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
            <div class="flex items-center gap-4">
              <span class="font-[var(--font-display)] text-2xl text-pml-accent">Casys PML</span>
              <span class="text-xs text-pml-text-dim uppercase tracking-[0.1em]">Procedural Memory Layer</span>
            </div>
            <div class="flex gap-8">
              <a href="https://casys.ai" target="_blank" rel="noopener" class="text-pml-text-muted no-underline text-sm hover:text-pml-accent">Casys.ai</a>
              <a
                href="https://github.com/Casys-AI/casys-pml"
                target="_blank"
                rel="noopener"
                class="text-pml-text-muted no-underline text-sm hover:text-pml-accent"
              >
                GitHub
              </a>
              <a href="/dashboard" class="text-pml-text-muted no-underline text-sm hover:text-pml-accent">Dashboard</a>
            </div>
          </div>
        </footer>

        <style>
          {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .article-content.markdown-body {
            background: transparent !important;
            color: var(--text, #f5f0ea) !important;
            font-family: var(--font-sans);
            font-size: 1.125rem;
            line-height: 1.9;
            max-width: 70ch;
            opacity: 0;
            animation: fadeIn 0.6s ease-out 0.2s forwards;
          }

          .markdown-body h1,
          .markdown-body h2,
          .markdown-body h3,
          .markdown-body h4 {
            font-family: var(--font-display);
            font-weight: 400;
            color: var(--text, #f5f0ea);
            margin-top: 2.5rem;
            margin-bottom: 1rem;
            border-bottom: none;
          }

          .markdown-body h2 { font-size: 1.75rem; }
          .markdown-body h3 { font-size: 1.375rem; }

          .markdown-body p {
            margin-bottom: 1.5rem;
            color: var(--text-muted, #d5c3b5);
          }

          .markdown-body a { color: var(--accent, #ffb86f); }

          .markdown-body strong {
            color: var(--text, #f5f0ea);
            font-weight: 600;
          }

          .markdown-body code:not(pre code) {
            background: var(--bg-elevated, #12110f);
            border: 1px solid var(--border, rgba(255, 184, 111, 0.1));
            padding: 0.2em 0.4em;
            border-radius: 4px;
            font-family: var(--font-mono);
            font-size: 0.875em;
            color: #ce9178;
          }

          .markdown-body .formula-scroll {
            display: block;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding: 0.5rem 0;
            margin: 0.5rem 0;
          }

          .markdown-body .formula-scroll code {
            white-space: nowrap;
          }

          .markdown-body pre,
          .markdown-body pre[class*="language-"],
          .markdown-body .highlight {
            background: #1a1a1d !important;
            border: 1px solid rgba(255, 184, 111, 0.6) !important;
            border-radius: 8px;
            padding: 1.25rem !important;
            overflow-x: auto;
            margin: 1.5rem 0 !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
          }

          .markdown-body .highlight { padding: 0 !important; }
          .markdown-body .highlight pre {
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }

          .markdown-body pre:hover,
          .markdown-body .highlight:hover {
            border-color: var(--accent, #ffb86f);
            transition: border-color 0.3s;
          }

          .markdown-body pre code,
          .markdown-body pre[class*="language-"] code {
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
            font-size: 12px !important;
            line-height: 1.7 !important;
            color: #d4d4d4 !important;
            font-family: 'Geist Mono', 'Consolas', 'Monaco', monospace !important;
          }

          .markdown-body blockquote {
            border-left: 3px solid var(--accent, #ffb86f);
            padding-left: 1.5rem;
            margin: 1.5rem 0;
            color: var(--text-muted, #d5c3b5);
            font-style: italic;
          }

          .markdown-body ul,
          .markdown-body ol {
            margin: 1.5rem 0;
            padding-left: 2rem;
            color: var(--text-muted, #d5c3b5);
          }

          .markdown-body li { margin-bottom: 0.5rem; }

          .markdown-body hr {
            border: none;
            border-top: 1px solid var(--border, rgba(255, 184, 111, 0.1));
            margin: 3rem 0;
          }

          .markdown-body details {
            margin: 1.5rem 0;
            background: var(--bg-elevated, #12110f);
            border: 1px solid var(--border-strong, rgba(255, 184, 111, 0.2));
            border-radius: 8px;
            overflow: hidden;
            transition: border-color 0.2s ease;
          }

          .markdown-body details:hover {
            border-color: rgba(255, 184, 111, 0.4);
          }

          .markdown-body details[open] {
            border-color: var(--accent, #ffb86f);
            box-shadow: 0 2px 12px rgba(255, 184, 111, 0.1);
          }

          .markdown-body summary {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 1.25rem;
            cursor: pointer;
            font-weight: 500;
            color: var(--text, #f5f0ea);
            background: linear-gradient(180deg, rgba(255, 184, 111, 0.08) 0%, rgba(255, 184, 111, 0.03) 100%);
            border-bottom: 1px solid transparent;
            transition: all 0.2s ease;
            list-style: none;
          }

          .markdown-body summary::-webkit-details-marker { display: none; }

          .markdown-body summary::before {
            content: "▶";
            font-size: 0.65rem;
            color: var(--accent, #ffb86f);
            transition: transform 0.2s ease;
            flex-shrink: 0;
          }

          .markdown-body details[open] summary::before {
            transform: rotate(90deg);
          }

          .markdown-body summary:hover {
            background: linear-gradient(180deg, rgba(255, 184, 111, 0.12) 0%, rgba(255, 184, 111, 0.06) 100%);
          }

          .markdown-body details[open] summary {
            border-bottom: 1px solid var(--border, rgba(255, 184, 111, 0.1));
          }

          .markdown-body details > *:not(summary) { padding: 0 1.25rem; }
          .markdown-body details > *:last-child { padding-bottom: 1.25rem; }
          .markdown-body details > p:first-of-type { padding-top: 1rem; }

          .markdown-body summary::after {
            content: "cliquer pour ouvrir";
            margin-left: auto;
            font-size: 0.7rem;
            font-weight: 400;
            color: var(--text-dim, #8a8078);
            opacity: 0;
            transition: opacity 0.2s ease;
            font-family: var(--font-mono);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .markdown-body summary:hover::after { opacity: 1; }
          .markdown-body details[open] summary::after { content: ""; }

          .markdown-body .diagram-scroll-wrapper {
            overflow-x: auto;
            margin: 2.5rem 0;
            padding: 1.5rem;
            background: var(--bg-elevated, #12110f);
            border-radius: 12px;
            border: 1px solid rgba(255, 184, 111, 0.2);
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(255, 184, 111, 0.1);
          }

          .markdown-body .diagram-scroll {
            overflow-x: auto;
            margin: 2rem 0;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 0.5rem;
            text-align: center;
          }

          .markdown-body .diagram-scroll img {
            display: inline-block;
            width: 100%;
            min-width: 100%;
            height: auto;
            max-width: 100%;
            margin: 0 auto;
            padding: 1rem;
            background: var(--bg-elevated, #12110f);
            border-radius: 12px;
            border: 1px solid rgba(255, 184, 111, 0.2);
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(255, 184, 111, 0.1);
          }

          .markdown-body .diagram-wide img {
            max-width: none;
            min-width: 600px;
          }

          .markdown-body .diagram-container {
            display: flex;
            justify-content: center;
            align-items: center;
            overflow-x: auto;
            margin: 2.5rem 0;
            padding: 1.5rem;
            background: var(--bg-elevated, #12110f);
            border-radius: 12px;
            border: 1px solid rgba(255, 184, 111, 0.2);
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(255, 184, 111, 0.1);
          }

          .markdown-body .diagram-container img {
            max-width: none;
            width: auto;
            height: auto;
            padding: 0;
            margin: 0;
            background: transparent;
            border: none;
            box-shadow: none;
          }

          .markdown-body table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin: 2rem 0;
            font-size: 0.9375rem;
            background: var(--bg-elevated, #12110f);
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border-strong, rgba(255, 184, 111, 0.2));
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
          }

          .markdown-body thead {
            background: linear-gradient(180deg, rgba(255, 184, 111, 0.12) 0%, rgba(255, 184, 111, 0.06) 100%);
          }

          .markdown-body th {
            font-family: var(--font-mono);
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--accent, #ffb86f);
            padding: 1rem 1.25rem;
            text-align: left;
            border-bottom: 2px solid rgba(255, 184, 111, 0.25);
            white-space: nowrap;
          }

          .markdown-body td {
            padding: 0.875rem 1.25rem;
            color: var(--text-muted, #d5c3b5);
            border-bottom: 1px solid var(--border, rgba(255, 184, 111, 0.1));
            vertical-align: top;
            line-height: 1.6;
          }

          .markdown-body tbody tr:last-child td { border-bottom: none; }
          .markdown-body tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.02); }
          .markdown-body tbody tr { transition: background 0.15s ease; }
          .markdown-body tbody tr:hover { background: rgba(255, 184, 111, 0.05); }

          .markdown-body td:first-child {
            color: var(--text, #f5f0ea);
            font-weight: 500;
          }

          .markdown-body td code,
          .markdown-body th code {
            font-size: 0.8125rem;
            padding: 0.15em 0.4em;
          }

          @media (min-width: 768px) {
            .markdown-body .diagram-scroll { overflow-x: auto; }
            .markdown-body .diagram-scroll img {
              width: auto;
              min-width: 700px;
              max-width: 100%;
              padding: 1.5rem;
            }
          }

          @media (max-width: 768px) {
            .markdown-body pre,
            .markdown-body pre[class*="language-"],
            .markdown-body .highlight {
              padding: 0.75rem !important;
              margin-left: -1rem !important;
              margin-right: -1rem !important;
              border-radius: 0 !important;
              border-left: none !important;
              border-right: none !important;
            }

            .markdown-body pre code,
            .markdown-body pre[class*="language-"] code {
              font-size: 11px !important;
              -webkit-overflow-scrolling: touch;
            }

            .markdown-body details {
              margin: 1rem -1rem;
              border-radius: 0;
              border-left: none;
              border-right: none;
            }

            .markdown-body summary::after { display: none; }

            .markdown-body img[src*="kroki.io"],
            .markdown-body img[alt*="Diagram"],
            .markdown-body img[alt*="Mermaid"],
            .markdown-body img[alt*="Excalidraw"],
            .markdown-body .diagram-container {
              margin: 1.5rem -1rem;
              padding: 1rem;
              border-radius: 0;
              border-left: none;
              border-right: none;
              max-width: none;
              min-width: auto;
              overflow-x: auto;
            }

            .markdown-body table {
              display: table;
              width: 100%;
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
              margin: 1.5rem 0;
              border-radius: 8px;
              border: 1px solid var(--border-strong, rgba(255, 184, 111, 0.2));
            }

            .markdown-body th,
            .markdown-body td {
              padding: 0.625rem 0.75rem;
              font-size: 0.8125rem;
            }

            .markdown-body th { font-size: 0.6875rem; }
          }
        `}
        </style>

        <script
          type="module"
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('scroll', () => {
                const article = document.querySelector('.article-content');
                if (!article) return;

                const articleTop = article.offsetTop;
                const articleHeight = article.offsetHeight;
                const scrollPosition = window.scrollY;
                const windowHeight = window.innerHeight;

                const progress = Math.min(
                  100,
                  Math.max(0, ((scrollPosition - articleTop + windowHeight) / articleHeight) * 100)
                );

                const progressBar = document.getElementById('reading-progress');
                if (progressBar) {
                  progressBar.style.width = progress + '%';
                }
              });
            `,
          }}
        />
      </div>
    </>
  );
}
