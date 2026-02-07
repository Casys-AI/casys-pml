export interface EmbeddingPort {
  /**
   * Génère un vecteur d'embedding pour le texte donné
   *
   * @param text - Texte à encoder en vecteur
   * @returns Vecteur d'embedding normalisé
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Génère des embeddings pour un batch de textes
   *
   * @param texts - Textes à encoder
   * @returns Vecteurs d'embeddings correspondants
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}
