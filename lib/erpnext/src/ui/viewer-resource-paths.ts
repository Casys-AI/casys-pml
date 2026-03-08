export function resolveViewerDistPath(
  moduleUrl: string,
  viewerName: string,
  exists: (path: string) => boolean,
): string | null {
  const candidates = [
    new URL(`./src/ui/dist/${viewerName}/index.html`, moduleUrl).pathname,
    new URL(`./ui-dist/${viewerName}/index.html`, moduleUrl).pathname,
  ];

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  return null;
}
