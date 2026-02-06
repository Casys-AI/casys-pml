# Files to Modify

| File | Changes |
|------|---------|
| `src/capabilities/static-structure-builder.ts` | Add `arguments` extraction for JSON.*, Object.*, Math.*, array/string methods |
| `src/capabilities/static-structure/ast-handlers.ts` | Add `arguments` extraction for BinaryExpression |
| `src/capabilities/static-structure/builder-context-adapter.ts` | Expose `extractArgumentValue` to HandlerContext |
| `src/capabilities/static-structure/types.ts` | Update HandlerContext interface |
| `src/capabilities/static-structure/edge-generators.ts` | Add `inferCodeProvidesEdge()` for semantic provides |
| `src/capabilities/static-structure/code-semantic-types.ts` | **NEW** - Semantic type definitions for code:* ops |
