import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

interface TocItem {
  id: string;
  title: string;
  level: number;
}

export default function DocsToc() {
  const tocItems = useSignal<TocItem[]>([]);
  const activeId = useSignal<string>("");

  useEffect(() => {
    const article = document.querySelector(".doc-content");
    if (!article) return;

    const headings = article.querySelectorAll("h2, h3, h4");
    const items: TocItem[] = [];

    headings.forEach((heading) => {
      const id = heading.id || heading.textContent?.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-") ||
        "";

      if (!heading.id && id) {
        heading.id = id;
      }

      if (id) {
        items.push({
          id,
          title: heading.textContent || "",
          level: parseInt(heading.tagName.charAt(1)),
        });
      }
    });

    tocItems.value = items;
  }, []);

  useEffect(() => {
    if (tocItems.value.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeId.value = entry.target.id;
            break;
          }
        }
      },
      {
        rootMargin: "-80px 0px -80% 0px",
        threshold: 0,
      },
    );

    tocItems.value.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [tocItems.value]);

  if (tocItems.value.length === 0) {
    return null;
  }

  return (
    <aside class="w-[220px] shrink-0 sticky top-[85px] h-[calc(100vh-100px)] overflow-y-auto px-4 hidden xl:block">
      <div class="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3 pb-2 border-b border-amber-400/[0.08]">
        On this page
      </div>
      <nav class="text-[0.8rem]">
        <ul class="list-none m-0 p-0">
          {tocItems.value.map((item) => (
            <li
              key={item.id}
              class="m-0"
              style={{
                paddingLeft: item.level === 2 ? "0" : item.level === 3 ? "0.75rem" : "1.5rem",
              }}
            >
              <a
                href={`#${item.id}`}
                class={`block py-1.5 no-underline transition-all duration-150 border-l-2 pl-3 -ml-3 ${
                  activeId.value === item.id
                    ? "text-amber-400 border-l-amber-400"
                    : "text-stone-400 border-transparent hover:text-stone-100"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  const element = document.getElementById(item.id);
                  if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "start" });
                    history.pushState(null, "", `#${item.id}`);
                    activeId.value = item.id;
                  }
                }}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
