import type { JSX } from "preact";
import { useSignal } from "@preact/signals";

interface NavLink {
  href: string;
  label: string;
  isExternal?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
  { href: "/catalog", label: "Catalog" },
  { href: "https://github.com/Casys-AI/casys-pml", label: "GitHub", isExternal: true },
];

function CloseIcon(): JSX.Element {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ExternalLinkIcon(): JSX.Element {
  return (
    <svg
      class="opacity-50 group-hover:opacity-100 transition-opacity"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  );
}

export default function MobileMenu(): JSX.Element {
  const isOpen = useSignal(false);

  function toggleMenu(): void {
    isOpen.value = !isOpen.value;
    document.body.style.overflow = isOpen.value ? "hidden" : "";
  }

  function closeMenu(): void {
    isOpen.value = false;
    document.body.style.overflow = "";
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleMenu}
        class="hidden md:hidden items-center justify-center w-11 h-11 p-0 bg-transparent border border-amber-400/15 rounded-[10px] cursor-pointer transition-all duration-200 hover:bg-amber-400/[0.08] hover:border-amber-400/30 focus:bg-amber-400/[0.08] focus:border-amber-400/30 focus:outline-none active:scale-95 max-md:flex"
        aria-label={isOpen.value ? "Close menu" : "Open menu"}
        aria-expanded={isOpen.value}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <div class="relative w-[22px] h-4">
          <span
            class={`absolute left-0 w-full h-0.5 bg-amber-400 rounded-sm transition-all duration-300 ${
              isOpen.value
                ? "top-1/2 -translate-y-1/2 rotate-45"
                : "top-0"
            }`}
            style={{ transitionTimingFunction: "cubic-bezier(0.68, -0.55, 0.265, 1.55)" }}
          />
          <span
            class={`absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-amber-400 rounded-sm transition-all duration-300 ${
              isOpen.value ? "opacity-0 -translate-x-2.5" : ""
            }`}
            style={{ transitionTimingFunction: "cubic-bezier(0.68, -0.55, 0.265, 1.55)" }}
          />
          <span
            class={`absolute left-0 w-full h-0.5 bg-amber-400 rounded-sm transition-all duration-300 ${
              isOpen.value
                ? "bottom-1/2 translate-y-1/2 -rotate-45"
                : "bottom-0"
            }`}
            style={{ transitionTimingFunction: "cubic-bezier(0.68, -0.55, 0.265, 1.55)" }}
          />
        </div>
      </button>

      <div
        class={`fixed inset-0 z-[998] bg-stone-950/85 backdrop-blur-sm transition-all duration-300 ${
          isOpen.value ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      <nav
        class={`fixed top-0 right-0 z-[999] w-[min(320px,85vw)] h-screen flex flex-col bg-gradient-to-br from-stone-900 via-stone-950 to-stone-950 border-l border-amber-400/[0.12] shadow-[-20px_0_60px_rgba(0,0,0,0.5)] overflow-hidden transition-transform duration-400 ${
          isOpen.value ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          height: "100dvh",
          transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        aria-hidden={!isOpen.value}
      >
        <div class="flex items-center justify-between px-6 py-5 border-b border-amber-400/[0.08]">
          <span class="font-serif text-2xl font-normal text-amber-400 tracking-tight">
            Casys PML
          </span>
          <button
            type="button"
            onClick={closeMenu}
            class="flex items-center justify-center w-10 h-10 p-0 bg-amber-400/5 border border-amber-400/10 rounded-[10px] text-stone-400 cursor-pointer transition-all duration-200 hover:bg-amber-400/10 hover:border-amber-400/20 hover:text-amber-400 focus:bg-amber-400/10 focus:border-amber-400/20 focus:text-amber-400 focus:outline-none"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <ul class="flex-1 list-none m-0 py-6 overflow-y-auto">
          {NAV_LINKS.map((link, index) => (
            <li
              key={link.href}
              class={`${isOpen.value ? "animate-slide-in" : "opacity-0 translate-x-5"}`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <a
                href={link.href}
                class="group relative flex items-center justify-between px-6 py-4 no-underline text-stone-100 font-sans text-lg font-medium tracking-wide transition-all duration-200 border-l-[3px] border-transparent hover:bg-amber-400/5 hover:text-amber-400 hover:pl-8 focus:bg-amber-400/5 focus:text-amber-400 focus:pl-8 focus:outline-none before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-0 before:bg-amber-400 before:rounded-r before:transition-[height] before:duration-200 hover:before:h-[60%] focus:before:h-[60%]"
                onClick={closeMenu}
                target={link.isExternal ? "_blank" : undefined}
                rel={link.isExternal ? "noopener noreferrer" : undefined}
              >
                <span class="relative">{link.label}</span>
                {link.isExternal && <ExternalLinkIcon />}
              </a>
            </li>
          ))}
        </ul>

        <div class="relative px-6 py-6 border-t border-amber-400/[0.08] overflow-hidden">
          <div class="font-mono text-[0.7rem] text-stone-500 uppercase tracking-[0.15em]">
            Procedural Memory Layer
          </div>
          <div class="absolute -bottom-[50px] -right-[50px] w-[150px] h-[150px] bg-[radial-gradient(circle,rgba(255,184,111,0.15)_0%,transparent_70%)] pointer-events-none" />
        </div>
      </nav>

      <style>
        {`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-slide-in {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
        `}
      </style>
    </>
  );
}
