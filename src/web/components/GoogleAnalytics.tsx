/**
 * Google Analytics 4 Component
 * Include in public pages (landing, blog, docs) to track visits
 *
 * Note: Fresh 2.x doesn't render <script src> in <Head> properly,
 * so we inject the full GA snippet via dangerouslySetInnerHTML.
 */

import { Head } from "fresh/runtime";

const GA_MEASUREMENT_ID = "G-FR86NHGK8Y";

export function GoogleAnalytics() {
  // Full GA4 snippet as raw HTML - Fresh 2.x workaround
  const gaSnippet = `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_MEASUREMENT_ID}');
    </script>
  `;

  return (
    <Head>
      <meta name="ga-inject" dangerouslySetInnerHTML={{ __html: gaSnippet }} />
    </Head>
  );
}
