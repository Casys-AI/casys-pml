// @ts-nocheck
import { page } from "fresh";
import { Head } from "fresh/runtime";
import { formatDate, getPosts, type Post } from "../../utils/posts.ts";
import { GoogleAnalytics } from "../../components/GoogleAnalytics.tsx";
import MobileMenu from "../../islands/MobileMenu.tsx";

export const handler = {
  async GET(_ctx: any) {
    try {
      const posts = await getPosts();
      return page({ posts });
    } catch (error) {
      console.error("Error loading posts:", error);
      return page({ posts: [] });
    }
  },
};

export default function BlogIndex({ data }: { data: { posts: Post[] } }) {
  const { posts } = data;

  return (
    <>
      <GoogleAnalytics />
      <Head>
        <title>Blog - Casys PML</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="Engineering insights, technical deep-dives, and lessons learned building Casys PML - a Procedural Memory Layer for AI agents."
        />
        <meta property="og:type" content="blog" />
        <meta property="og:url" content="https://pml.casys.ai/blog" />
        <meta property="og:title" content="Blog - Casys PML" />
        <meta
          property="og:description"
          content="Engineering insights, technical deep-dives, and lessons learned building Casys PML - a Procedural Memory Layer for AI agents."
        />
        <meta property="og:image" content="https://pml.casys.ai/assets/og/blog-index.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Casys PML" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Blog - Casys PML" />
        <meta
          name="twitter:description"
          content="Engineering insights, technical deep-dives, and lessons learned building Casys PML."
        />
        <meta name="twitter:image" content="https://pml.casys.ai/assets/og/blog-index.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          rel="alternate"
          type="application/atom+xml"
          title="Casys PML Blog Feed"
          href="/blog/feed.xml"
        />
        <style>{`html,body{background:#0a0908;margin:0}`}</style>
      </Head>

      <div class="min-h-screen bg-pml-bg text-pml-text font-[var(--font-sans)] flex flex-col overflow-x-hidden">
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
              <a href="/blog/feed.xml" class="flex p-2 rounded-md text-pml-text-muted no-underline text-sm font-medium transition-colors duration-200 hover:text-pml-accent hover:bg-pml-accent-dim" title="RSS Feed">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="6.18" cy="17.82" r="2.18" />
                  <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z" />
                </svg>
              </a>
              <MobileMenu />
            </nav>
          </div>
        </header>

        <main class="flex-1 py-8 md:py-24 pb-8 md:pb-16">
          <div class="max-w-[1000px] mx-auto px-4 md:px-8">
            <div class="text-center mb-8 md:mb-16">
              <span class="inline-block font-[var(--font-mono)] text-[0.7rem] text-pml-accent uppercase tracking-[0.15em] py-2 px-4 bg-pml-accent-dim rounded mb-6">Engineering Blog</span>
              <h1 class="font-[var(--font-display)] text-3xl md:text-5xl font-normal mb-4">Insights & Deep Dives</h1>
              <p class="text-lg text-pml-text-muted max-w-[500px] mx-auto">
                Technical explorations, debugging stories, and lessons learned building Casys PML.
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-auto">
              {posts.length === 0 ? <p class="text-center text-pml-text-muted py-16 col-span-full">No posts yet. Check back soon!</p> : (
                posts.map((post: Post, index: number) => (
                  <a
                    href={`/blog/${post.slug}`}
                    class={`post-card relative block p-6 md:p-8 bg-pml-bg-surface border border-pml-border rounded-2xl no-underline overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] opacity-0 animate-[fadeInUp_0.6s_ease-out_forwards] hover:border-pml-accent hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] ${
                      (index % 4) === 0 ? "md:col-span-2" : ""
                    }${(index % 4) === 3 ? "md:col-span-2" : ""}`}
                    key={post.slug}
                    style={`animation-delay: ${index * 0.1}s`}
                  >
                    <div class="relative z-[2]">
                      <div class="flex items-center gap-4 mb-4">
                        <span class="font-[var(--font-mono)] text-[0.7rem] text-pml-accent uppercase tracking-[0.1em] py-1 px-3 bg-pml-accent-dim rounded">{post.category}</span>
                        <time class="text-sm text-pml-text-dim">{formatDate(post.date)}</time>
                      </div>
                      <h2 class="font-[var(--font-display)] text-2xl md:text-[1.75rem] font-normal mb-4 text-pml-text leading-[1.3] transition-colors duration-200 group-hover:text-pml-accent">{post.title}</h2>
                      <p class="text-base text-pml-text-muted leading-relaxed mb-6">{post.snippet}</p>
                      <div class="flex justify-between items-center flex-wrap gap-3">
                        <div class={`flex flex-wrap gap-2 ${(index % 4) === 1 || (index % 4) === 2 ? "md:hidden" : ""}`}>
                          {post.tags.slice(0, 3).map((tag) => (
                            <span class="font-[var(--font-mono)] text-xs text-pml-text-dim" key={tag}>#{tag}</span>
                          ))}
                        </div>
                        <span class="read-arrow text-sm text-pml-accent font-medium opacity-70 transition-all duration-200">
                          Read →
                        </span>
                      </div>
                    </div>
                    <div class="post-card-glow absolute inset-0 bg-[radial-gradient(600px_circle_at_var(--mouse-x,50%)_var(--mouse-y,50%),rgba(255,184,111,0.08),transparent_40%)] opacity-0 transition-opacity duration-300 pointer-events-none"></div>
                  </a>
                ))
              )}
            </div>
          </div>
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

      </div>
    </>
  );
}
