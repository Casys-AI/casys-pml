/**
 * Config Copy Button Island
 *
 * Interactive button to copy MCP configuration to clipboard.
 *
 * @module web/islands/ConfigCopyButton
 */

import { useSignal } from "@preact/signals";

interface ConfigCopyButtonProps {
  config: string;
}

export default function ConfigCopyButton({ config }: ConfigCopyButtonProps) {
  const copied = useSignal(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(config);
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      type="button"
      class="btn-copy"
      onClick={handleCopy}
    >
      {copied.value ? "Copied!" : "Copy"}
    </button>
  );
}
