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

            <div class="markdown-body animate-fade-in">
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
              <a href="/dashboard" class="text-pml-text-muted no-underline text-sm hover:text-pml-accent">App</a>
            </div>
          </div>
        </footer>

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
