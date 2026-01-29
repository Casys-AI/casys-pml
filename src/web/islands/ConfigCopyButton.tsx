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

const BASE_STYLE = {
  padding: "0.25rem 0.75rem",
  fontSize: "0.75rem",
  fontWeight: "600",
  fontFamily: "'Geist', sans-serif",
  borderRadius: "4px",
  cursor: "pointer",
  transition: "all 0.2s",
};

const DEFAULT_BORDER_COLOR = "rgba(255, 184, 111, 0.08)";
const DEFAULT_TEXT_COLOR = "#a8a29e";
const HOVER_COLOR = "#FFB86F";
const SUCCESS_BG = "rgba(74, 222, 128, 0.2)";
const SUCCESS_COLOR = "#4ade80";
const DEFAULT_BG = "#08080a";

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

  function handleMouseOver(e: MouseEvent): void {
    if (!copied.value) {
      const button = e.target as HTMLButtonElement;
      button.style.borderColor = HOVER_COLOR;
      button.style.color = HOVER_COLOR;
    }
  }

  function handleMouseOut(e: MouseEvent): void {
    if (!copied.value) {
      const button = e.target as HTMLButtonElement;
      button.style.borderColor = DEFAULT_BORDER_COLOR;
      button.style.color = DEFAULT_TEXT_COLOR;
    }
  }

  const buttonStyle = {
    ...BASE_STYLE,
    border: `1px solid ${DEFAULT_BORDER_COLOR}`,
    background: copied.value ? SUCCESS_BG : DEFAULT_BG,
    color: copied.value ? SUCCESS_COLOR : DEFAULT_TEXT_COLOR,
  };

  return (
    <button
      type="button"
      style={buttonStyle}
      onClick={handleCopy}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      {copied.value ? "Copied!" : "Copy"}
    </button>
  );
}
