/**
 * ChatPanel - Panel de chat compact (côté gauche du Canvas Split)
 *
 * Affiche le contexte conversationnel de façon compacte.
 *
 * @module web/components/landing-v2/organisms/ChatPanel
 */

interface ChatPanelProps {
  userMessage: string;
  class?: string;
}

export function ChatPanel({ userMessage, class: className = "" }: ChatPanelProps) {
  return (
    <div
      class={`
        flex flex-col
        w-[140px]
        bg-[#0a0a0c]
        border-r border-white/[0.06]
        ${className}
      `.trim()}
    >
      {/* Header */}
      <div class="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/[0.06]">
        <div class="flex gap-1">
          <span class="w-2 h-2 rounded-full bg-red-500/50" />
          <span class="w-2 h-2 rounded-full bg-yellow-500/50" />
          <span class="w-2 h-2 rounded-full bg-green-500/50" />
        </div>
        <span class="font-mono text-[0.5rem] text-stone-600 ml-auto">chat</span>
      </div>

      {/* Messages */}
      <div class="flex-1 p-2.5 space-y-2 overflow-hidden">
        {/* User message */}
        <div class="flex flex-col items-end gap-1">
          <div class="flex items-center gap-1">
            <span class="font-mono text-[0.45rem] text-stone-600">you</span>
            <div class="w-4 h-4 rounded bg-pml-accent/20 flex items-center justify-center">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="#FFB86F">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
          </div>
          <div class="bg-pml-accent/10 border border-pml-accent/15 rounded-lg rounded-tr-sm px-2 py-1.5 max-w-full">
            <p class="text-[0.6rem] text-stone-300 leading-tight break-words">
              {userMessage}
            </p>
          </div>
        </div>

        {/* Assistant indicator */}
        <div class="flex items-start gap-1">
          <div class="w-4 h-4 rounded bg-white/[0.08] flex items-center justify-center flex-shrink-0">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div class="flex items-center gap-1 mt-0.5">
            <span class="w-1 h-1 rounded-full bg-pml-accent animate-pulse" />
            <span class="font-mono text-[0.45rem] text-stone-500">generating UI...</span>
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      <div class="px-2.5 py-1.5 border-t border-white/[0.04]">
        <p class="font-mono text-[0.4rem] text-stone-600 text-center">
          canvas mode
        </p>
      </div>
    </div>
  );
}
