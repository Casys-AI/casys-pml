/**
 * Config Copy Button Island
 *
 * Interactive button to copy MCP configuration to clipboard.
 *
 * @module web/islands/ConfigCopyButton
 */

import { useSignal } from "@preact/signals";

export interface ConfigCopyButtonProps {
  config: string;
}

const COPY_FEEDBACK_DURATION_MS = 2000;

export default function ConfigCopyButton({
  config,
}: ConfigCopyButtonProps): JSX.Element {
  const copied = useSignal(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(config);
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, COPY_FEEDBACK_DURATION_MS);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  return (
    <button
      type="button"
      class={`py-1 px-3 text-xs font-semibold rounded cursor-pointer transition-all duration-200 border ${
        copied.value
          ? "bg-green-400/20 text-green-400 border-green-400/20"
          : "bg-stone-950 text-stone-400 border-amber-500/10 hover:border-pml-accent hover:text-pml-accent"
      }`}
      onClick={handleCopy}
    >
      {copied.value ? "Copied!" : "Copy"}
    </button>
  );
}
