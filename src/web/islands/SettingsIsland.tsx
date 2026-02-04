/**
 * Settings Island - Interactive API Key Management
 *
 * Handles:
 * - Showing/hiding API key
 * - Copying API key to clipboard
 * - Toast notifications
 *
 * @module web/islands/SettingsIsland
 */

import type { JSX } from "preact";
import { useSignal } from "@preact/signals";

const TOAST_DURATION_MS = 3000;
const MASKED_KEY_LENGTH = 16;

export interface SettingsIslandProps {
  flashApiKey: string | null;
  apiKeyPrefix: string | null;
}

function InfoIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function EyeOpenIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeClosedIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function CopyIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function getMaskedKey(flashApiKey: string | null, showKey: boolean, apiKeyPrefix: string | null): string {
  if (flashApiKey && showKey) {
    return flashApiKey;
  }
  if (apiKeyPrefix) {
    return `${apiKeyPrefix}${"\u2022".repeat(MASKED_KEY_LENGTH)}`;
  }
  return "No API key generated";
}

function getKeyNote(hasFlashKey: boolean): string {
  if (hasFlashKey) {
    return "This is your full API key. Copy it now - it won't be visible after you leave this page.";
  }
  return "The full API key is only shown once when generated. You can regenerate a new key if needed.";
}

export default function SettingsIsland({
  flashApiKey,
  apiKeyPrefix,
}: SettingsIslandProps): JSX.Element {
  const showKey = useSignal(false);
  const copied = useSignal(false);
  const toastMessage = useSignal<string | null>(null);

  function showToast(message: string): void {
    toastMessage.value = message;
    setTimeout(() => {
      toastMessage.value = null;
    }, TOAST_DURATION_MS);
  }

  async function handleCopy(): Promise<void> {
    if (!flashApiKey) {
      showToast("Full key not available - regenerate to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(flashApiKey);
      copied.value = true;
      showToast("API key copied!");
      setTimeout(() => {
        copied.value = false;
      }, TOAST_DURATION_MS);
    } catch {
      showToast("Failed to copy to clipboard");
    }
  }

  function handleToggleShow(): void {
    if (flashApiKey) {
      showKey.value = !showKey.value;
    }
  }

  const maskedKey = getMaskedKey(flashApiKey, showKey.value, apiKeyPrefix);
  const keyNote = getKeyNote(Boolean(flashApiKey));
  const copyTitle = flashApiKey ? "Copy API key" : "Regenerate key to copy";

  return (
    <div class="relative">
      {flashApiKey && (
        <div class="flex items-start gap-3 p-4 bg-green-400/10 border border-green-400/20 rounded-lg mb-4">
          <span class="text-green-400 shrink-0 mt-0.5">
            <InfoIcon />
          </span>
          <div class="flex-1">
            <strong class="block text-green-400 mb-1 text-[0.9rem]">New API Key Generated!</strong>
            <span class="text-stone-400 text-[0.8rem]">Save this key now - it won't be shown again after you leave this page.</span>
          </div>
        </div>
      )}

      <div class="flex items-center gap-4 p-4 bg-stone-950 border border-amber-500/10 rounded-lg mb-3">
        <code class="flex-1 font-mono text-[0.9rem] text-stone-400 break-all">{maskedKey}</code>
        <div class="flex gap-2 shrink-0">
          {flashApiKey && (
            <button
              type="button"
              class="inline-flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-md border border-amber-500/10 bg-stone-950 text-stone-400 cursor-pointer transition-all duration-200 hover:border-amber-400 hover:text-amber-400"
              onClick={handleToggleShow}
              title={showKey.value ? "Hide key" : "Show key"}
            >
              {showKey.value ? <EyeClosedIcon /> : <EyeOpenIcon />}
              <span>{showKey.value ? "Hide" : "Show"}</span>
            </button>
          )}
          <button
            type="button"
            class="inline-flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-md border border-amber-500/10 bg-stone-950 text-stone-400 cursor-pointer transition-all duration-200 hover:border-amber-400 hover:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-amber-500/10 disabled:hover:text-stone-400"
            onClick={handleCopy}
            disabled={!flashApiKey}
            title={copyTitle}
          >
            <CopyIcon />
            <span>{copied.value ? "Copied!" : "Copy"}</span>
          </button>
        </div>
      </div>

      <p class="text-[0.8rem] text-stone-500">{keyNote}</p>

      {toastMessage.value && (
        <div class="fixed bottom-8 right-8 flex items-center gap-2 py-3 px-5 bg-stone-900 border border-green-400/20 rounded-lg text-green-400 text-sm font-medium shadow-[0_10px_30px_rgba(0,0,0,0.4)] animate-[slideIn_0.3s_ease-out] z-[1000]">
          <CheckIcon />
          {toastMessage.value}
        </div>
      )}
    </div>
  );
}
