export interface ImageUploaderPort {
  /**
   * Upload d'une image encodée en base64 vers la cible d'assets du projet/tenant.
   * L'implémentation (FS, GitHub, CDN) résout assets_path et assets_url_base.
   * Doit fail-fast si le type/mime n'est pas supporté.
   */
  uploadBase64Image(params: {
    base64: string;
    filename: string; // ex: <slug>-<shortId>.<ext>
    mime: string; // ex: image/webp, image/png, image/jpeg
    tenantId: string;
    projectId: string;
  }): Promise<{
    url: string; // URL finale publique (ou route-absolute) à utiliser dans le frontmatter
  }>;
}
