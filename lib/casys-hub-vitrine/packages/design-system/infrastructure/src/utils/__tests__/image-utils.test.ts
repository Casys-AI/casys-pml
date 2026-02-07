import { describe, expect, it } from 'vitest';

import { assertNever, isDataUrl, isHttpUrl, parseDataUrl } from '../image-utils';

describe('image-utils', () => {
  describe('URL helpers', () => {
    it('isHttpUrl / isDataUrl détectent correctement', () => {
      expect(isHttpUrl('http://x')).toBe(true);
      expect(isHttpUrl('https://x')).toBe(true);
      expect(isHttpUrl('ftp://x')).toBe(false);
      expect(isDataUrl('data:image/webp;base64,AAAA')).toBe(true);
      expect(isDataUrl('http://x')).toBe(false);
    });

    it('gère les valeurs undefined/null', () => {
      expect(isHttpUrl(undefined)).toBe(false);
      expect(isHttpUrl('')).toBe(false);
      expect(isDataUrl(undefined)).toBe(false);
      expect(isDataUrl('')).toBe(false);
    });

    it('gère les protocoles en majuscules', () => {
      expect(isHttpUrl('HTTP://example.com')).toBe(true);
      expect(isHttpUrl('HTTPS://example.com')).toBe(true);
      expect(isDataUrl('DATA:image/png;base64,test')).toBe(true);
    });
  });

  describe('parseDataUrl', () => {
    it('parse une data URL valide', () => {
      const result = parseDataUrl('data:image/png;base64,aGVsbG8=');
      expect(result.mimeType).toBe('image/png');
      expect(result.data).toEqual(Buffer.from('hello'));
    });

    it('throw si URL invalide', () => {
      expect(() => parseDataUrl('http://example.com')).toThrow(/URL invalide/);
    });

    it('throw si format invalide', () => {
      expect(() => parseDataUrl('data:image/png,notbase64')).toThrow(/format attendu/);
    });

    it('accepte payload base64 valide avec caractères spéciaux', () => {
      // Buffer.from accepte des caractères invalides sans lever d'erreur
      const result = parseDataUrl('data:image/png;base64,aGVsbG8hISE=');
      expect(result.mimeType).toBe('image/png');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('throw si payload vide', () => {
      expect(() => parseDataUrl('data:image/png;base64,')).toThrow(/payload base64 invalide/);
    });

    it('normalise le mimeType en minuscules', () => {
      const result = parseDataUrl('data:IMAGE/PNG;base64,aGVsbG8=');
      expect(result.mimeType).toBe('image/png');
    });

    it('gère les espaces dans le mimeType', () => {
      const result = parseDataUrl('data: image/png ;base64,aGVsbG8=');
      expect(result.mimeType).toBe('image/png');
    });
  });

  describe('assertNever', () => {
    it('throw toujours', () => {
      expect(() => assertNever('X' as never, 'boom')).toThrow('boom');
    });
  });
});
