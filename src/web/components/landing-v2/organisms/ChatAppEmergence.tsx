/**
 * ChatAppEmergence - Illustration complète du Hero
 *
 * "Parlez. L'application apparaît."
 *
 * Montre une vraie application UI qui émerge dans le chat.
 * C'est le concept central : le chat devient l'application.
 *
 * @module web/components/landing-v2/organisms/ChatAppEmergence
 */

import { ChatWindow } from "./ChatWindow.tsx";
import { ChatBubble } from "../molecules/ChatBubble.tsx";
import { DeploymentApp } from "./DeploymentApp.tsx";

interface ChatAppEmergenceProps {
  class?: string;
}

export function ChatAppEmergence({ class: className = "" }: ChatAppEmergenceProps) {
  return (
    <div
      class={`relative ${className}`}
      role="img"
      aria-label="Animation showing an application appearing in a chat: user asks for deployment dashboard, and a full interactive dashboard UI emerges in the conversation"
    >
      {/* Subtle glow behind */}
      <div
        class="absolute -inset-4 rounded-3xl opacity-30 blur-2xl pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(255,184,111,0.15) 0%, transparent 70%)",
        }}
      />

      <ChatWindow class="relative z-10">
        {/* User message */}
        <div class="animate-fade-up">
          <ChatBubble variant="user" text="Show me the deployment dashboard" />
        </div>

        {/* App emergence - the magic moment */}
        <div class="animate-fade-up-delay-1">
          <DeploymentApp
            version="v2.1.0"
            podsStatus="3/3 healthy"
            progress={87}
            activeButton="continue"
          />
        </div>

        {/* Subtle label */}
        <div class="text-center animate-fade-up-delay-2">
          <span class="inline-block px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] font-mono text-[0.6rem] text-stone-500">
            The app appears. Interact directly.
          </span>
        </div>
      </ChatWindow>
    </div>
  );
}
