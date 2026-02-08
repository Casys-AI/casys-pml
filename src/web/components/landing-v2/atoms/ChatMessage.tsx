/**
 * ChatMessage - Message dans le chat
 *
 * Affiche un message utilisateur ou assistant dans le chat.
 *
 * @module web/components/landing-v2/atoms/ChatMessage
 */

import type { ComponentChildren } from "preact";

export type ChatMessageVariant = "user" | "assistant" | "thinking";

interface ChatMessageProps {
  variant: ChatMessageVariant;
  children: ComponentChildren;
  class?: string;
}

const variantStyles: Record<ChatMessageVariant, string> = {
  user: "bg-pml-accent/10 border-pml-accent/20 text-stone-200",
  assistant: "bg-white/[0.02] border-white/[0.06] text-stone-400",
  thinking: "bg-white/[0.02] border-white/[0.06] text-stone-500 italic",
};

export function ChatMessage({ variant, children, class: className = "" }: ChatMessageProps) {
  return (
    <div
      class={`
        py-2.5 px-4
        rounded-xl border
        font-sans text-[0.85rem] leading-relaxed
        ${variantStyles[variant]}
        ${className}
      `.trim()}
    >
      {variant === "thinking" ? (
        <span class="inline-flex items-center gap-1">
          <span class="animate-pulse">●</span>
          <span class="animate-pulse animation-delay-100">●</span>
          <span class="animate-pulse animation-delay-200">●</span>
        </span>
      ) : (
        children
      )}
    </div>
  );
}
