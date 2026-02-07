export interface ImageGeneratorPort {
  /**
   * Génère une image à partir des données parsées du POML.
   * Retourne l'image encodée en base64 ainsi que son type MIME et un alt suggéré.
   * Nota: aucun upload ni URL finale ici (géré par les publishers/uploader).
   */
  generateImage(data: {
    prompt: string;
    format: string;
    width: number;
    height: number;
  }): Promise<{ base64: string; mime: string; alt: string }>;
}
