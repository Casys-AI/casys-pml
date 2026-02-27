/**
 * Root Layout - Applied to all pages
 *
 * Adds common head elements like favicon.
 */
import { Head } from "fresh/runtime";

export default function RootLayout({ Component }: { Component: () => JSX.Element }) {
  return (
    <html lang="en">
      <Head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <body>
        <Component />
      </body>
    </html>
  );
}
