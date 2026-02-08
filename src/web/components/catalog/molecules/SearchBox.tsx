/**
 * SearchBox - Search input with icon
 *
 * Styled search input for filtering catalog entries.
 *
 * @module web/components/catalog/molecules/SearchBox
 */

interface SearchBoxProps {
  /** Current search value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Accent color for focus */
  accentColor?: string;
}

export default function SearchBox({
  value,
  onChange,
  placeholder = "Search...",
  accentColor = "#FFB86F",
}: SearchBoxProps) {
  return (
    <div
      class="search-box"
      style={{
        position: "relative",
      }}
    >
      {/* Search icon */}
      <svg
        class="search-box__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        style={{
          position: "absolute",
          left: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          width: "16px",
          height: "16px",
          color: "#4a4540",
          pointerEvents: "none",
          transition: "color 0.2s",
        }}
      >
        <circle cx="11" cy="11" r="7" strokeWidth="1.5" />
        <path strokeWidth="1.5" d="m20 20-4-4" />
      </svg>

      {/* Input */}
      <input
        type="text"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        class="search-box__input"
        style={{
          width: "100%",
          padding: "11px 36px 11px 40px",
          fontSize: "0.8125rem",
          fontFamily: "'Geist Mono', monospace",
          color: "#e8e4df",
          background: "#0e0e10",
          border: "1px solid #1a1a1e",
          borderRadius: "8px",
          outline: "none",
          transition: "all 0.2s",
        }}
      />

      {/* Clear button */}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          class="search-box__clear"
          style={{
            position: "absolute",
            right: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "22px",
            height: "22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "#2a2a2e",
            color: "#6b6560",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            lineHeight: 1,
            transition: "all 0.15s",
          }}
        >
          ×
        </button>
      )}

      <style>
        {`
          .search-box__input::placeholder {
            color: #4a4540;
          }

          .search-box__input:focus {
            border-color: ${accentColor}40;
            background: #111113;
            box-shadow: 0 0 0 3px ${accentColor}10;
          }

          .search-box:focus-within .search-box__icon {
            color: ${accentColor};
          }

          .search-box__clear:hover {
            background: #3a3a3e;
            color: ${accentColor};
          }
        `}
      </style>
    </div>
  );
}
