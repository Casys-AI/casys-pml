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
    <section class="blog-section">
      <div class="container">
        <div class="blog__header">
          <SectionLabel>{blog.label}</SectionLabel>
          <h2 class="blog__title">{blog.title}</h2>
          <p class="blog__desc">{blog.description}</p>
        </div>

        <div class="blog__grid">
          {posts.map((post) => (
            <article key={post.slug} class="blog-card">
              <div class="blog-card__meta">
                <span class="blog-card__category">{post.category}</span>
                <time class="blog-card__date">{formatDate(post.date)}</time>
              </div>
              <h3 class="blog-card__title">
                <a href={`/blog/${post.slug}`}>{post.title}</a>
              </h3>
              <p class="blog-card__snippet">{post.snippet}</p>
              <div class="blog-card__tags">
                {post.tags.slice(0, 3).map((tag) => (
                  <span key={tag} class="blog-card__tag">
                    #{tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div class="blog__cta">
          <a href={blog.cta.href} class="btn btn--ghost">
            {blog.cta.label}
          </a>
        </div>
      </div>

      <style>
        {`
        .blog-section {
          position: relative;
          z-index: 10;
          padding: 5rem 2rem;
          background: #08080a;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .blog__header {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .blog__title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 2.5rem;
          font-weight: 400;
          color: #f0ede8;
          margin-bottom: 1rem;
        }

        .blog__desc {
          font-size: 1.125rem;
          color: #a8a29e;
          max-width: 600px;
          margin: 0 auto;
        }

        .blog__grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .blog-card {
          padding: 1.75rem;
          background: #141418;
          border: 1px solid rgba(255, 184, 111, 0.15);
          border-radius: 12px;
          transition: all 0.2s;
        }

        .blog-card:hover {
          border-color: #FFB86F;
          transform: translateY(-4px);
        }

        .blog-card__meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .blog-card__category {
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          color: #FFB86F;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          padding: 0.2rem 0.6rem;
          background: rgba(255, 184, 111, 0.1);
          border-radius: 4px;
        }

        .blog-card__date {
          font-size: 0.8rem;
          color: #6b6560;
        }

        .blog-card__title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 1.25rem;
          font-weight: 400;
          margin-bottom: 0.75rem;
        }

        .blog-card__title a {
          color: #f0ede8;
          text-decoration: none;
        }

        .blog-card__title a:hover {
          color: #FFB86F;
        }

        .blog-card__snippet {
          font-size: 0.9rem;
          color: #a8a29e;
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        .blog-card__tags {
          display: flex;
          gap: 0.5rem;
        }

        .blog-card__tag {
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          color: #888888;
        }

        .blog__cta {
          text-align: center;
        }

        .btn--ghost {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.875rem 1.5rem;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: 'Geist', -apple-system, system-ui, sans-serif;
          text-decoration: none;
          border-radius: 8px;
          background: transparent;
          color: #a8a29e;
          border: 1px solid rgba(255, 184, 111, 0.15);
          transition: all 0.2s;
        }

        .btn--ghost:hover {
          background: rgba(255, 184, 111, 0.1);
          border-color: #FFB86F;
          color: #f0ede8;
        }

        @media (max-width: 1024px) {
          .blog__grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .blog__grid {
            grid-template-columns: 1fr;
          }

          .blog__title {
            font-size: 2rem;
          }
        }
        `}
      </style>
    </section>
  );
}
