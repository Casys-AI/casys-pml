// @ts-nocheck: Documentation page with complex nested navigation
import { HttpError, page } from "fresh";
import { Head } from "fresh/runtime";
import { PRISM_THEME_CSS } from "../../utils/prism-theme.ts";
import { type DocNavItem, type DocPage, getDocPage, getDocsNavigation } from "../../utils/docs.ts";
import DocsSidebar from "../../islands/DocsSidebar.tsx";
import DocsToc from "../../islands/DocsToc.tsx";
import { GoogleAnalytics } from "../../components/GoogleAnalytics.tsx";
import MobileMenu from "../../islands/MobileMenu.tsx";

interface DocsPageData {
  doc: DocPage;
  navigation: DocNavItem[];
  currentPath: string;
}

export const handler = {
  async GET(ctx: any) {
    try {
      // slug can be undefined (root), string, or string[]
      const slugParam = ctx.params.slug;
      const slugParts: string[] = slugParam
        ? Array.isArray(slugParam) ? slugParam : slugParam.split("/")
        : [];

      const doc = await getDocPage(slugParts);

      if (!doc) {
        throw new HttpError(404, "Documentation page not found");
      }

      const navigation = await getDocsNavigation();
      const currentPath = "/docs" + (slugParts.length > 0 ? "/" + slugParts.join("/") : "");

      return page({ doc, navigation, currentPath });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      console.error(`Error loading doc:`, error);
      throw new HttpError(500, "Internal server error");
    }
  },
};

// Navigation component moved to islands/DocsSidebar.tsx for interactivity

export default function DocsPage({ data }: { data: DocsPageData }) {
  const { doc, navigation, currentPath } = data;

  return (
    <>
      <GoogleAnalytics />
      <Head>
        <title>{doc.title} - Casys PML Docs</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={doc.description} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <style>{`html,body{background:#08080a;margin:0}`}</style>
        <style dangerouslySetInnerHTML={{ __html: PRISM_THEME_CSS }} />
      </Head>

      <div class="min-h-screen bg-[#08080a] text-stone-100 font-[Geist,_-apple-system,_system-ui,_sans-serif] flex flex-col overflow-x-hidden">
        <header class="sticky top-0 z-100 px-4 py-4 md:px-8 bg-[#08080a]/95 backdrop-blur-xl border-b border-amber-400/8">
          <div class="max-w-[1400px] mx-auto flex justify-between items-center">
            <a href="/" class="flex items-center gap-4 no-underline">
              <span class="font-[Instrument_Serif,_Georgia,_serif] text-2xl text-amber-400">Casys PML</span>
              <span class="text-xs text-stone-500 tracking-widest uppercase hidden md:inline">Documentation</span>
            </a>
            <nav class="flex items-center gap-3 md:gap-8">
              <a href="/" class="hidden md:inline text-stone-400 no-underline text-sm font-medium transition-colors duration-200 hover:text-amber-400">Home</a>
              <a href="/blog" class="hidden md:inline text-stone-400 no-underline text-sm font-medium transition-colors duration-200 hover:text-amber-400">Blog</a>
              <a href="/docs" class="hidden md:inline text-amber-400 no-underline text-sm font-medium">Docs</a>
              <a
                href="https://github.com/Casys-AI/casys-pml"
                class="flex items-center p-2 text-stone-400 rounded-md transition-all duration-200 hover:text-stone-100 hover:bg-amber-400/10"
                target="_blank"
                rel="noopener"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </a>
              <MobileMenu />
            </nav>
          </div>
        </header>

        <div class="flex flex-1 max-w-[1400px] mx-auto w-full">
          <DocsSidebar navigation={navigation} currentPath={currentPath} />

          <main class="flex-1 min-w-0 p-4 md:p-6 lg:px-12 lg:py-8">
            <nav class="flex items-center gap-2 mb-8 text-sm">
              {doc.breadcrumbs.map((crumb, index) => (
                <span key={crumb.href}>
                  {index > 0 && <span class="text-stone-500">/</span>}
                  {index === doc.breadcrumbs.length - 1
                    ? <span class="text-stone-100">{crumb.label}</span>
                    : <a href={crumb.href} class="text-stone-400 no-underline transition-colors duration-200 hover:text-amber-400">{crumb.label}</a>}
                </span>
              ))}
            </nav>

            <article class={`
              bg-transparent text-stone-100 font-[Geist,_-apple-system,_system-ui,_sans-serif] text-base leading-relaxed max-w-[800px]
              [&_h1]:font-[Instrument_Serif,_Georgia,_serif] [&_h1]:text-4xl [&_h1]:font-normal [&_h1]:text-stone-100 [&_h1]:mb-4 [&_h1]:pb-3 [&_h1]:border-b [&_h1]:border-amber-400/8
              [&_h2]:font-[Instrument_Serif,_Georgia,_serif] [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:text-stone-100 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-amber-400/8
              [&_h3]:font-[Instrument_Serif,_Georgia,_serif] [&_h3]:text-xl [&_h3]:font-normal [&_h3]:text-stone-100 [&_h3]:mt-8 [&_h3]:mb-3
              [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-stone-100 [&_h4]:mt-6 [&_h4]:mb-2
              [&_p]:mb-4 [&_p]:text-stone-400
              [&_a]:text-amber-400 [&_a]:no-underline [&_a:hover]:underline
              [&_strong]:text-stone-100 [&_strong]:font-semibold
              [&_code:not(pre_code)]:bg-[#0f0f12] [&_code:not(pre_code)]:border [&_code:not(pre_code)]:border-amber-400/8 [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:font-[Geist_Mono,_monospace] [&_code:not(pre_code)]:text-[0.875em] [&_code:not(pre_code)]:text-[#ce9178]
              [&_pre]:bg-[#1a1a1d]! [&_pre]:border! [&_pre]:border-amber-400/15! [&_pre]:rounded-lg [&_pre]:p-4! [&_pre]:overflow-x-auto [&_pre]:my-4! [&_pre:hover]:border-amber-400!
              [&_pre_code]:bg-transparent! [&_pre_code]:border-none! [&_pre_code]:p-0! [&_pre_code]:text-sm! [&_pre_code]:leading-relaxed! [&_pre_code]:text-[#d4d4d4]! [&_pre_code]:font-[Geist_Mono,_monospace]!
              [&_blockquote]:border-l-[3px] [&_blockquote]:border-amber-400 [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:text-stone-400 [&_blockquote]:italic
              [&_ul]:my-4 [&_ul]:pl-6 [&_ul]:text-stone-400
              [&_ol]:my-4 [&_ol]:pl-6 [&_ol]:text-stone-400
              [&_li]:mb-2
              [&_hr]:border-none [&_hr]:border-t [&_hr]:border-amber-400/8 [&_hr]:my-8
              [&_table]:w-full [&_table]:border-collapse [&_table]:my-6
              [&_th]:bg-[#0f0f12] [&_th]:p-3 [&_th]:text-left [&_th]:font-semibold [&_th]:text-stone-100 [&_th]:border [&_th]:border-amber-400/8
              [&_td]:p-3 [&_td]:border [&_td]:border-amber-400/8 [&_td]:text-stone-400
              [&_tr:hover_td]:bg-amber-400/10
              [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-4
              md:[&_h1]:text-4xl
              max-md:[&_h1]:text-[1.75rem] max-md:[&_h2]:text-xl
              max-md:[&_pre]:mx-[-1rem]! max-md:[&_pre]:rounded-none! max-md:[&_pre]:p-4! max-md:[&_pre]:text-[0.8rem]!
              max-md:[&_pre_code]:text-xs!
            `}>
              <div dangerouslySetInnerHTML={{ __html: doc.html }} />
            </article>
          </main>

          <DocsToc />
        </div>
      </div>
    </>
  );
}
