/**
 * SearchInput - Atomic search input component
 * @module web/components/atoms/SearchInput
 */

interface SearchInputProps {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  class?: string;
}

export default function SearchInput({
  value,
  onInput,
  placeholder = "Search...",
  class: className = "",
}: SearchInputProps) {
  return (
    <>
      <div class={`search-input-wrapper ${className}`}>
        <svg class="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8" strokeWidth="2" />
          <path strokeWidth="2" d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={value}
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
          placeholder={placeholder}
          class="search-input"
        />
      </div>
      <style>
        {`
        .search-input-wrapper {
          position: relative;
        }

        .search-input-icon {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          color: #6b6560;
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          padding: 0.625rem 0.75rem 0.625rem 2.25rem;
          font-size: 0.875rem;
          color: #f0ede8;
          background: #141418;
          border: 1px solid rgba(255, 184, 111, 0.1);
          border-radius: 8px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .search-input::placeholder {
          color: #6b6560;
        }

        .search-input:focus {
          border-color: rgba(255, 184, 111, 0.3);
          box-shadow: 0 0 0 3px rgba(255, 184, 111, 0.05);
        }
        `}
      </style>
    </>
  );
}
