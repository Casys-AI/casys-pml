/**
 * Google Analytics 4 Component
 * Include in public pages (landing, blog, docs) to track visits
 */

import { Head } from "fresh/runtime";

const GA_MEASUREMENT_ID = "G-FR86NHGK8Y";

export function GoogleAnalytics() {
  return (
    <Head>
      {/* External gtag.js script - async loading */}
      <script
        async={true}
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      >
      </script>
      {/* GA4 initialization */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `,
        }}
      />
    </Head>
  );
}
