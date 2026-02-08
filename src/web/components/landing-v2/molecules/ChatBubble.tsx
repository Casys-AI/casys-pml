/**
 * ChatBubble - Message complet avec avatar
 *
 * Combine avatar + ChatMessage pour un message complet dans le chat.
 *
 * @module web/components/landing-v2/molecules/ChatBubble
 */

import { ChatMessage, type ChatMessageVariant } from "../atoms/ChatMessage.tsx";

interface ChatBubbleProps {
  variant: ChatMessageVariant;
  text: string;
  showAvatar?: boolean;
  class?: string;
}

export function ChatBubble({
  variant,
  text,
  showAvatar = true,
  class: className = "",
}: ChatBubbleProps) {
  const isUser = variant === "user";

  return (
    <div class={`flex items-start gap-2.5 ${isUser ? "" : "flex-row-reverse"} ${className}`}>
      {/* Avatar */}
      {showAvatar && (
        <div
          class={`
            shrink-0 w-7 h-7 rounded-full
            flex items-center justify-center
            ${isUser ? "bg-pml-accent/20 border border-pml-accent/30" : "bg-white/[0.06] border border-white/[0.1]"}
          `}
        >
          {isUser ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFB86F" class="opacity-80">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#a8a29e" class="opacity-80">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z" />
            </svg>
          )}
        </div>
      )}

      {/* Message */}
      <div class={`flex-1 ${isUser ? "" : "text-right"}`}>
        <ChatMessage variant={variant}>
          {variant === "user" ? `"${text}"` : text}
        </ChatMessage>
      </div>
    </div>
  );
}
