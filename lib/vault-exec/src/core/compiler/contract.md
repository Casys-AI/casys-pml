# core/compiler contract

## Inputs

- Parsed notes and existing frontmatter.
- LLM port responses for compilation.

## Outputs

- Deterministic compiled frontmatter and reconstructed note content.
- Structured compile workflow results keyed by note name.

## Invariants

- Compilation never mutates note ordering nondeterministically.
- Frontmatter normalization is explicit and test-covered.
- Prompt and parsing logic remain pure within this slice.
