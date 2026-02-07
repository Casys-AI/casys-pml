import { extract, token_set_ratio } from 'fuzzball';

import type { DomainOntology, OntologyNode } from '@casys/core';

/**
 * Ranked keyword de DataForSEO
 */
export interface RankedKeyword {
  keyword: string;
  position: number;
  searchVolume: number;
}

/**
 * Builder d'enrichissement d'ontologie avec données SEO
 * Utilise fuzzy matching pour mapper ranked keywords sur les nœuds
 */
export class OntologyEnricherBuilder {
  /**
   * Enrichit une ontologie avec les ranked keywords
   * @param ontology Ontologie de base (IA)
   * @param rankedKeywords Keywords rankés de DataForSEO
   * @returns Ontologie enrichie avec volumes et positions
   */
  enrichWithRankedKeywords(
    ontology: DomainOntology,
    rankedKeywords: RankedKeyword[]
  ): DomainOntology {

    const enrichedNodes = ontology.nodes.map(node => {
      // Trouver keywords matchants par fuzzy matching
      const matchingKeywords = this.findMatchingKeywords(node, rankedKeywords);

      // Calculer volume total et position moyenne
      const totalVolume = matchingKeywords.reduce((sum, kw) => sum + kw.searchVolume, 0);
      const avgPosition = matchingKeywords.length > 0
        ? matchingKeywords.reduce((sum, kw) => sum + kw.position, 0) / matchingKeywords.length
        : undefined;

      // Ajouter les keywords matchés à la liste
      const allKeywords = [
        ...node.keywords,
        ...matchingKeywords.map(kw => kw.keyword)
      ];
      const uniqueKeywords = [...new Set(allKeywords)];

      return {
        ...node,
        keywords: uniqueKeywords,
        volume: totalVolume || 0, // Force 0 si undefined/NaN
        avgPosition,
        metadata: {
          ...node.metadata,
          source: totalVolume > 0 ? ('hybrid' as const) : node.metadata?.source ?? ('ai' as const),
          confidence: totalVolume > 0 ? 0.95 : (node.metadata?.confidence ?? 0.8)
        }
      };
    });

    // Calculer métadonnées globales
    const totalVolume = enrichedNodes.reduce((sum, node) => sum + (node.volume || 0), 0);
    const avgConfidence = enrichedNodes.reduce((sum, node) =>
      sum + (node.metadata?.confidence ?? 0), 0) / enrichedNodes.length;

    return {
      ...ontology,
      nodes: enrichedNodes,
      metadata: {
        ...ontology.metadata,
        totalVolume,
        avgConfidence
      }
    };
  }

  /**
   * Trouve les keywords matchants pour un nœud avec fuzzy matching
   */
  private findMatchingKeywords(
    node: OntologyNode,
    rankedKeywords: RankedKeyword[]
  ): RankedKeyword[] {
    const matches: { keyword: RankedKeyword; score: number }[] = [];

    rankedKeywords.forEach(rankedKw => {
      const score = this.calculateMatchScore(node, rankedKw.keyword);
      if (score > 70) { // Seuil de similarité 70%
        matches.push({ keyword: rankedKw, score });
      }
    });

    // Trier par score décroissant et retourner
    return matches
      .sort((a, b) => b.score - a.score)
      .map(m => m.keyword);
  }

  /**
   * Calcule le score de match entre un nœud et un keyword
   * Utilise fuzzy matching sur le label et les keywords du nœud
   */
  private calculateMatchScore(node: OntologyNode, keyword: string): number {
    const normalizedKeyword = keyword.toLowerCase().trim();

    // 1. Match exact sur label ou keywords du nœud
    if (node.label.toLowerCase() === normalizedKeyword) return 100;
    if (node.keywords.some(k => k.toLowerCase() === normalizedKeyword)) return 100;

    // 2. Inclusion directe
    if (normalizedKeyword.includes(node.label.toLowerCase())) return 90;
    if (node.label.toLowerCase().includes(normalizedKeyword)) return 85;

    // 3. Fuzzy matching sur le label
    const labelChoices = [node.label, ...node.keywords];
    const fuzzyResults = extract(normalizedKeyword, labelChoices, {
      scorer: token_set_ratio, // Meilleur pour les phrases
      limit: 1
    });

    return fuzzyResults.length > 0 ? fuzzyResults[0][1] : 0;
  }

  /**
   * Extrait les top keywords de l'ontologie pour proposedSeeds
   */
  extractTopKeywords(ontology: DomainOntology, limit = 15): string[] {
    return ontology.nodes
      .filter(node => node.volume > 0) // Seulement les nœuds avec volume
      .sort((a, b) => b.volume - a.volume) // Trier par volume décroissant
      .flatMap(node => node.keywords) // Extraire tous les keywords
      .filter((kw, index, self) => self.indexOf(kw) === index) // Unique
      .slice(0, limit); // Limiter
  }
}
