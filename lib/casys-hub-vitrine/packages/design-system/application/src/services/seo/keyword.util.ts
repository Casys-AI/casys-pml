import { slugifyKeyword } from '@casys/core';

export function toSlug(label: string): string {
  const s = String(label ?? '').trim().toLowerCase();
  // Basic slugification: replace spaces with dashes, remove duplicate dashes
  // Délégué désormais au VO centralisé pour cohérence globale
  return slugifyKeyword(s);
}
