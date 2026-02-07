declare module 'pomljs' {
  export function read(
    element: string,
    options?: unknown,
    context?: Record<string, unknown>,
    stylesheet?: unknown,
    sourcePath?: string
  ): Promise<string>;
}
