/**
 * BlogSectionV2 - "Insights & Updates"
 *
 * Latest blog posts preview with V2 messaging.
 *
 * @module web/components/landing-v2/sections/BlogSectionV2
 */

import { blog } from "../../../content/landing-v2.ts";
import type { Post } from "../../../utils/posts.ts";

interface BlogSectionV2Props {
  posts: Post[];
  formatDate: (date: Date) => string;
}

export function BlogSectionV2({ posts, formatDate }: BlogSectionV2Props) {
  if (posts.length === 0) return null;

  return (
    <section class="relative py-20 px-8 sm:py-14 sm:px-5 bg-[#08080a]">
      <div class="max-w-[1100px] mx-auto">
        <div class="text-center mb-12">
          <p class="font-mono text-[0.7rem] sm:text-[0.6rem] font-medium text-pml-accent uppercase tracking-[0.2em] sm:tracking-[0.15em] mb-4">
            {blog.label}
          </p>
          <h2 class="font-serif text-[clamp(1.5rem,3.5vw,2.5rem)] font-normal text-stone-100 mb-3">
            {blog.title}
          </h2>
          <p class="text-[0.95rem] text-stone-500 max-w-[500px] mx-auto leading-relaxed">
            {blog.description}
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {posts.map((post) => (
            <article
              key={post.slug}
              class="p-5 bg-white/[0.02] border border-white/[0.06] rounded-lg transition-all duration-200 hover:border-pml-accent/40 hover:bg-pml-accent/[0.02]"
            >
              <div class="flex items-center gap-3 mb-3">
                <span class="font-mono text-[0.6rem] text-pml-accent uppercase tracking-wide py-0.5 px-2 bg-pml-accent/10 rounded">
                  {post.category}
                </span>
                <time class="text-[0.75rem] text-stone-600">
                  {formatDate(post.date)}
                </time>
              </div>
              <h3 class="font-serif text-lg font-normal mb-2">
                <a href={`/blog/${post.slug}`} class="text-stone-200 no-underline hover:text-pml-accent transition-colors">
                  {post.title}
                </a>
              </h3>
              <p class="text-[0.8rem] text-stone-500 leading-relaxed mb-3">
                {post.snippet}
              </p>
              <div class="flex gap-2">
                {post.tags.slice(0, 3).map((tag) => (
                  <span key={tag} class="font-mono text-[0.65rem] text-stone-600">
                    #{tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div class="text-center">
          <a
            href={blog.cta.href}
            class="inline-flex items-center py-2 px-4 font-mono text-[0.75rem] text-pml-accent no-underline border border-pml-accent/20 rounded-md transition-all duration-200 hover:bg-pml-accent/[0.06] hover:border-pml-accent/40"
          >
            {blog.cta.label}
          </a>
        </div>
      </div>
    </section>
  );
}
