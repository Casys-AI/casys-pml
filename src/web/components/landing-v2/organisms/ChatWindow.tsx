/**
 * ChatWindow - Fenêtre de chat
 *
 * Container stylé comme une fenêtre de chat (Claude/ChatGPT).
 * Contient les messages et l'app qui émerge.
 *
 * @module web/components/landing-v2/organisms/ChatWindow
 */

import type { ComponentChildren } from "preact";

interface ChatWindowProps {
  children: ComponentChildren;
  class?: string;
}

export function ChatWindow({ children, class: className = "" }: ChatWindowProps) {
  return (
    <div
      class={`
        relative
        w-full
        rounded-2xl
        bg-[#0a0a0c]
        border border-white/[0.08]
        shadow-2xl shadow-black/50
        overflow-hidden
        ${className}
      `.trim()}
    >
      {/* Window header - style terminal/app */}
      <div class="flex items-center gap-2 py-2.5 px-4 bg-white/[0.02] border-b border-white/[0.06]">
        <div class="flex gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <span class="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <span class="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span class="flex-1 text-center font-mono text-[0.65rem] text-stone-600">
          chat
        </span>
      </div>

      {/* Chat content */}
      <div class="p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}
