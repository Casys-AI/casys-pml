/**
 * Redirect all /blog/* requests to casys.ai blog
 */
import type { FreshContext } from "fresh";

export const handler = {
  GET(_req: Request, _ctx: FreshContext): Response {
    return new Response(null, {
      status: 301,
      headers: { Location: "https://casys.ai/blog" },
    });
  },
};
