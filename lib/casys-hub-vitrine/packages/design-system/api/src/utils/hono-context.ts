import type { Context, ContextVariableMap } from 'hono';

type CVM = ContextVariableMap;
interface TypedContext {
  set<K extends keyof CVM>(key: K, value: CVM[K]): void;
}

// Helper fortement typé pour setter une variable de contexte Hono
export function ctxSet<K extends keyof CVM>(c: Context, key: K, value: CVM[K]): void {
  (c as unknown as TypedContext).set(key, value);
}

// Variante UNSAFE (à n'utiliser que pour l'injection dynamique en tests)
export function ctxSetUnsafe(c: Context, key: string, value: unknown): void {
  (c as unknown as { set: (k: string, v: unknown) => void }).set(key, value);
}
