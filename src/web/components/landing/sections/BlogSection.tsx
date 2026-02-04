/**
 * BlogSection - Latest blog posts preview
 *
 * @module web/components/landing/sections/BlogSection
 */

import { SectionLabel } from "../atoms/SectionLabel.tsx";
import { blog } from "../../../content/landing.ts";
import type { Post } from "../../../utils/posts.ts";

interface BlogSectionProps {
  posts: Post[];
  formatDate: (date: Date) => string;
}

export function BlogSection({ posts, formatDate }: BlogSectionProps) {
  if (posts.length === 0) return null;

  return (
    <section class="relative z-10 py-20 px-8 bg-[#08080a]">
      <div class="max-w-[1200px] mx-auto">
        <div class="text-center mb-10">
          <SectionLabel>{blog.label}</SectionLabel>
          <h2 class="font-serif text-4xl md:text-[2rem] font-normal text-stone-100 mb-4">
            {blog.title}
          </h2>
          <p class="text-lg text-stone-400 max-w-[600px] mx-auto">
            {blog.description}
          </p>
        </div>

        <div class="grid grid-cols-3 lg:grid-cols-2 md:grid-cols-1 gap-6 mb-8">
          {posts.map((post) => (
            <article
              key={post.slug}
              class="p-7 bg-[#141418] border border-pml-accent/15 rounded-xl transition-all duration-200 hover:border-pml-accent hover:-translate-y-1"
            >
              <div class="flex items-center gap-4 mb-4">
                <span class="font-mono text-[0.65rem] text-pml-accent uppercase tracking-[0.1em] py-0.5 px-2.5 bg-pml-accent/10 rounded">
                  {post.category}
                </span>
                <time class="text-[0.8rem] text-stone-500">
                  {formatDate(post.date)}
                </time>
              </div>
              <h3 class="font-serif text-xl font-normal mb-3">
                <a href={`/blog/${post.slug}`} class="text-stone-100 no-underline hover:text-pml-accent">
                  {post.title}
                </a>
              </h3>
              <p class="text-sm text-stone-400 leading-relaxed mb-4">
                {post.snippet}
              </p>
              <div class="flex gap-2">
                {post.tags.slice(0, 3).map((tag) => (
                  <span key={tag} class="font-mono text-[0.75rem] text-stone-500">
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
            class="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold font-sans no-underline rounded-lg bg-transparent text-stone-400 border border-pml-accent/15 transition-all duration-200 hover:bg-pml-accent/10 hover:border-pml-accent hover:text-stone-100"
          >
            {blog.cta.label}
          </a>
        </div>
      </div>
    </section>
  );
}
