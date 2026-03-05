/**
 * Compatibility facade kept for older imports.
 * New call sites should prefer `./domain/message-passing.ts`.
 */
export {
  edgeToEdge,
  edgeToVertex,
  vertexToEdge,
} from "./domain/message-passing.ts";
