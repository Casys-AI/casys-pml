---
description: "Detect stale or missing documentation after a work session. Run at end of session to find doc drift."
allowed-tools: Read, Glob, Grep, Bash
---

# Doc Drift Detector

Detect documentation that is stale, references deleted/renamed files, or is missing for recently changed code.

## Step 1: Identify what changed this session

Run `git diff --name-only` and `git diff --cached --name-only` to get all modified files.
Also run `git log --oneline -5` to understand recent commit scope.

## Step 2: Scan documentation sources

Find all doc files that could reference the changed code:

1. **MEMORY.md**: `~/.claude/projects/-home-ubuntu-CascadeProjects-AgentCards/memory/MEMORY.md`
2. **Memory topic files**: `~/.claude/projects/-home-ubuntu-CascadeProjects-AgentCards/memory/*.md`
3. **CLAUDE.md files**: all `CLAUDE.md` and `.claude/rules/*.md` in the project
4. **Tech specs**: `_bmad-output/implementation-artifacts/tech-specs/*.md`
5. **Plans**: `docs/plans/*.md`

## Step 3: Cross-reference — find drift

For each changed file, grep the doc sources for references to:
- The filename (e.g. `train-worker-prod.ts`)
- Key symbols exported from the file (class names, function names)
- The directory path

Flag these categories:

### A. Stale references (HIGH priority)
File paths or symbols mentioned in docs that NO LONGER EXIST in the codebase.
Run: for each path/symbol mentioned in docs, verify it still exists.

### B. Outdated descriptions (MEDIUM priority)
Files that changed significantly (>30 lines diff) but whose doc descriptions may not reflect the changes.
Show the file, what the doc says, and a 1-line summary of what actually changed.

### C. Undocumented changes (LOW priority)
Files that were added or significantly modified but have ZERO mentions in any doc.
Only flag files that seem architecturally important (not test files, not config tweaks).

## Step 4: Output report

Format the report as:

```
## Doc Drift Report

### Stale References (fix now)
| Doc file | Line | References | Status |
|----------|------|------------|--------|
| MEMORY.md | 42 | `old-file.ts` | DELETED |

### Possibly Outdated (review)
| Doc file | Describes | What changed |
|----------|-----------|--------------|
| memory/gru-training.md | GRU training loop | +45 lines in train-loop.ts |

### Undocumented (consider adding)
| File | Why it matters |
|------|---------------|
| `src/new-module.ts` | New module, 200+ lines, no doc coverage |

### Summary
- X stale references to fix
- Y descriptions to review
- Z new files worth documenting
```

## Step 5: Propose actions

For each stale reference, propose the fix (delete the line, update the path, etc).
For outdated descriptions, suggest a 1-line update.
For undocumented files, suggest which doc file should cover them and a 1-line description.

Ask the user which fixes to apply before making any changes.
