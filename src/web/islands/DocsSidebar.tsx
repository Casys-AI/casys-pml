import { useSignal } from "@preact/signals";
import type { DocNavItem } from "../utils/docs.ts";

interface DocsSidebarProps {
  navigation: DocNavItem[];
  currentPath: string;
}

function NavItem({
  item,
  currentPath,
  depth = 0,
  expandedSections,
  toggleSection,
}: {
  item: DocNavItem;
  currentPath: string;
  depth?: number;
  expandedSections: Set<string>;
  toggleSection: (href: string) => void;
}) {
  const isActive = currentPath === item.href;
  const isParentActive = currentPath.startsWith(item.href + "/");
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedSections.has(item.href) || isActive || isParentActive;

  const handleClick = (e: Event) => {
    if (hasChildren) {
      e.preventDefault();
      toggleSection(item.href);
      globalThis.location.href = item.href;
    }
  };

  const handleArrowClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSection(item.href);
  };

  const paddingLeft = 1.5 + depth * 1;

  return (
    <li class="m-0">
      <a
        href={item.href}
        class={`flex items-center gap-2 py-2.5 text-stone-400 no-underline text-sm transition-all duration-150 border-l-2 cursor-pointer hover:text-stone-100 hover:bg-pml-accent/10 ${
          isActive
            ? "text-pml-accent bg-pml-accent/10 border-l-pml-accent"
            : isParentActive
            ? "text-stone-100 border-transparent"
            : "border-transparent"
        }`}
        style={{ paddingLeft: `${paddingLeft}rem`, paddingRight: "1.5rem" }}
        onClick={hasChildren ? handleClick : undefined}
      >
        {hasChildren && (
          <span
            class={`flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded transition-transform duration-200 hover:bg-pml-accent/10 ${
              isExpanded ? "rotate-90" : ""
            }`}
            onClick={handleArrowClick}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        )}
        <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{item.title}</span>
      </a>
      {hasChildren && isExpanded && (
        <ul class="list-none m-0 p-0">
          {item.children!.map((child) => (
            <NavItem
              key={child.slug}
              item={child}
              currentPath={currentPath}
              depth={depth + 1}
              expandedSections={expandedSections}
              toggleSection={toggleSection}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function DocsSidebar({ navigation, currentPath }: DocsSidebarProps) {
  const getInitialExpanded = (): Set<string> => {
    const expanded = new Set<string>();
    const parts = currentPath.split("/").filter(Boolean);
    let path = "";
    for (const part of parts) {
      path += "/" + part;
      expanded.add(path);
    }
    return expanded;
  };

  const expandedSections = useSignal<Set<string>>(getInitialExpanded());

  const toggleSection = (href: string) => {
    const newExpanded = new Set(expandedSections.value);
    if (newExpanded.has(href)) {
      newExpanded.delete(href);
    } else {
      newExpanded.add(href);
    }
    expandedSections.value = newExpanded;
  };

  return (
    <aside class="w-[280px] shrink-0 border-r border-pml-accent/[0.08] bg-stone-900 sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto hidden lg:block">
      <div class="p-6 border-b border-pml-accent/[0.08]">
        <a
          href="/docs"
          class="font-serif text-xl text-stone-100 no-underline hover:text-pml-accent"
        >
          Documentation
        </a>
      </div>
      <nav class="py-4">
        <ul class="list-none m-0 p-0">
          {navigation.map((item) => (
            <NavItem
              key={item.slug}
              item={item}
              currentPath={currentPath}
              expandedSections={expandedSections.value}
              toggleSection={toggleSection}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}
