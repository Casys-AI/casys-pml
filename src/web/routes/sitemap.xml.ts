/**
 * sitemap.xml - Dynamic sitemap for SEO
 * Lists all public pages: home, blog posts, docs
 */

import { getPosts } from "../utils/posts.ts";
import { getDocsNavigation, type DocNavItem } from "../utils/docs.ts";

const SITE_URL = "https://pml.casys.ai";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Flatten docs navigation tree to get all URLs
function flattenDocsNav(items: DocNavItem[], urls: string[] = []): string[] {
  for (const item of items) {
    urls.push(`/docs/${item.href}`);
    if (item.children && item.children.length > 0) {
      flattenDocsNav(item.children, urls);
    }
  }
  return urls;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export const handler = {
  async GET(_req: Request): Promise<Response> {
    try {
      const now = new Date();
      const urls: { loc: string; lastmod: string; priority: string; changefreq: string }[] = [];

      // Static pages
      urls.push({
        loc: SITE_URL,
        lastmod: formatDate(now),
        priority: "1.0",
        changefreq: "weekly",
      });

      urls.push({
        loc: `${SITE_URL}/blog`,
        lastmod: formatDate(now),
        priority: "0.9",
        changefreq: "daily",
      });

      urls.push({
        loc: `${SITE_URL}/docs`,
        lastmod: formatDate(now),
        priority: "0.9",
        changefreq: "weekly",
      });

      // Blog posts
      const posts = await getPosts();
      for (const post of posts) {
        urls.push({
          loc: `${SITE_URL}/blog/${post.slug}`,
          lastmod: formatDate(post.date),
          priority: "0.8",
          changefreq: "monthly",
        });
      }

      // Documentation pages
      try {
        const docsNav = await getDocsNavigation();
        const docUrls = flattenDocsNav(docsNav);
        for (const docUrl of docUrls) {
          urls.push({
            loc: `${SITE_URL}${docUrl}`,
            lastmod: formatDate(now),
            priority: "0.7",
            changefreq: "weekly",
          });
        }
      } catch (error) {
        console.error("Error loading docs for sitemap:", error);
        // Continue without docs - sitemap should still work
      }

      // Generate XML
      const urlEntries = urls
        .map(
          (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
        )
        .join("\n");

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

      return new Response(sitemap, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600", // 1 hour
        },
      });
    } catch (error) {
      console.error("Error generating sitemap:", error);
      return new Response("Error generating sitemap", { status: 500 });
    }
  },
};
