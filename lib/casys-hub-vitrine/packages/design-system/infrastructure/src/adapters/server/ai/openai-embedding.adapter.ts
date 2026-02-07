import { OpenAIEmbeddings } from '@langchain/openai';

import type { EmbeddingPort } from '@casys/application';

/**
 * Adaptateur OpenAI pour la génération d'embeddings vectoriels
 * Implémente EmbeddingPort en utilisant l'API OpenAI via LangChain
 */
export class OpenAIEmbeddingAdapter implements EmbeddingPort {
  private embeddingModel: OpenAIEmbeddings;

  constructor(apiKey?: string) {
    this.embeddingModel = new OpenAIEmbeddings({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small', // Modèle optimisé coût/performance
    });
  }

  /**
   * Génère un vecteur d'embedding pour le texte donné
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Le texte ne peut pas être vide pour générer un embedding');
    }

    try {
      const embedding = await this.embeddingModel.embedQuery(text.trim());
      return embedding;
    } catch (error) {
      throw new Error(
        `Erreur lors de la génération de l'embedding: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Génère des embeddings pour un batch de textes (plus efficace)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Filtrer les textes vides
    const validTexts = texts.filter(text => text && text.trim().length > 0);
    if (validTexts.length === 0) {
      throw new Error('Aucun texte valide fourni pour générer les embeddings');
    }

    try {
      const embeddings = await this.embeddingModel.embedDocuments(validTexts.map(t => t.trim()));
      return embeddings;
    } catch (error) {
      throw new Error(
        `Erreur lors de la génération des embeddings batch: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
