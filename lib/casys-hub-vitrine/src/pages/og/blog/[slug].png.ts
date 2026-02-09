// @ts-nocheck
/**
 * Dynamic OG Image for blog posts
 * Route: /og/blog/[slug].png (1200x630)
 */

import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { generateOgImage } from '../_shared';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.map((post) => {
    // slug is like "en/ai-moves-to-messaging" — strip locale prefix
    const slug = post.slug.replace(/^(en|fr|zh)\//, '');
    return {
      params: { slug },
      props: { title: post.data.title, category: post.data.category || 'Blog' },
    };
  });
};

export const GET: APIRoute = async ({ props }) => {
  const { title, category } = props as { title: string; category: string };

  return generateOgImage({
    type: 'div',
    props: {
      style: {
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0a0908',
        padding: '60px',
        position: 'relative',
      },
      children: [
        // Background gradient
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage:
                'radial-gradient(circle at 20% 80%, rgba(255, 184, 111, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(167, 139, 250, 0.06) 0%, transparent 50%)',
            },
          },
        },
        // Top: Logo + brand + category
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '40px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          backgroundColor: '#FFB86F',
                          marginRight: '16px',
                        },
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: '32px', fontWeight: 700, color: '#FFB86F' },
                        children: 'Casys',
                      },
                    },
                  ],
                },
              },
              // Category badge
              {
                type: 'span',
                props: {
                  style: {
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#FFB86F',
                    padding: '6px 16px',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(255, 184, 111, 0.12)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  },
                  children: category,
                },
              },
            ],
          },
        },
        // Main content: title
        {
          type: 'div',
          props: {
            style: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: title.length > 60 ? '48px' : '56px',
                    fontWeight: 700,
                    color: '#f5f0ea',
                    lineHeight: 1.15,
                    maxWidth: '1000px',
                  },
                  children: title,
                },
              },
            ],
          },
        },
        // Bottom bar
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(255, 184, 111, 0.2)',
              paddingTop: '24px',
            },
            children: [
              {
                type: 'span',
                props: {
                  style: { fontSize: '18px', color: '#888' },
                  children: 'Blog · casys.ai',
                },
              },
              {
                type: 'span',
                props: {
                  style: { fontSize: '18px', color: '#FFB86F' },
                  children: 'casys.ai/blog',
                },
              },
            ],
          },
        },
      ],
    },
  });
};
