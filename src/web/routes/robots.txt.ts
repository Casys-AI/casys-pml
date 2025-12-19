/**
 * robots.txt - Search engine crawler instructions
 */

const SITE_URL = "https://pml.casys.ai";

export const handler = {
  GET(_req: Request): Response {
    const robotsTxt = `# Casys PML - Procedural Memory Layer
# https://pml.casys.ai

User-agent: *
Allow: /

# Sitemap location
Sitemap: ${SITE_URL}/sitemap.xml

# Disallow private/API routes
Disallow: /api/
Disallow: /auth/
Disallow: /dashboard/
`;

    return new Response(robotsTxt, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400", // 24 hours
      },
    });
  },
};
