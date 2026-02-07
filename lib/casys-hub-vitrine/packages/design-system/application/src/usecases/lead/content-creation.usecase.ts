import type { DomainOntology } from '@casys/core';

import type { LeadAnalysisUseCaseDeps } from './types';

export interface TopicCluster {
  id: string;
  pillarTopic: string;
  pillarKeyword: string;
  supportingTopics: Array<{
    topic: string;
    keywords: string[];
  }>;
  estimatedArticles: number;
}

export interface ContentBrief {
  id: string;
  title: string;
  keywords: string[];
  outline: string[];
  targetWordCount: number;
  contentType: 'pillar' | 'supporting' | 'listicle' | 'how-to' | 'guide';
  priority: 'high' | 'medium' | 'low';
}

export interface InternalLinkingSuggestion {
  fromTopic: string;
  toTopic: string;
  anchorText: string;
  relevanceScore: number;
}

export interface ContentCreationResult {
  topicClusters: TopicCluster[];
  contentBriefs: ContentBrief[];
  internalLinkingSuggestions: InternalLinkingSuggestion[];
}

export interface ContentCreationCallbacks {
  onTopicCluster: (cluster: TopicCluster) => Promise<void>;
  onContentBrief: (brief: ContentBrief) => Promise<void>;
  onLinkingSuggestion: (suggestion: InternalLinkingSuggestion) => Promise<void>;
  onProgress: (status: string) => Promise<void>;
}

/**
 * Lead Analysis - Content Creation (Step 3)
 * Generates topic clusters, content briefs, and internal linking suggestions
 */
export class ContentCreationUseCase {
  constructor(private readonly deps: LeadAnalysisUseCaseDeps) {}

  /**
   * Execute Content Creation with streaming
   * @param input - Ontology and selected seeds
   * @param callbacks - SSE streaming callbacks
   */
  async execute(
    input: {
      ontology: DomainOntology;
      selectedSeeds?: string[];
    },
    callbacks: ContentCreationCallbacks
  ): Promise<ContentCreationResult> {
    await callbacks.onProgress('Generating topic clusters...');

    const topicClusters: TopicCluster[] = [];
    const contentBriefs: ContentBrief[] = [];
    const internalLinkingSuggestions: InternalLinkingSuggestion[] = [];

    // 1. Generate topic clusters (pillar + supporting)
    const level1Nodes = input.ontology.nodes.filter(n => n.level === 1);
    for (const pillarNode of level1Nodes) {
      const supportingNodes = input.ontology.nodes.filter(n => 
        n.level === 2 && 
        input.ontology.edges.some(e => e.from === pillarNode.id && e.to === n.id)
      );

      const cluster: TopicCluster = {
        id: pillarNode.id,
        pillarTopic: pillarNode.label,
        pillarKeyword: pillarNode.keywords?.[0] || pillarNode.label,
        supportingTopics: supportingNodes.map(n => ({
          topic: n.label,
          keywords: n.keywords || [n.label]
        })),
        estimatedArticles: 1 + supportingNodes.length
      };

      topicClusters.push(cluster);
      await callbacks.onTopicCluster(cluster);
    }

    // 2. Generate content briefs for each topic
    await callbacks.onProgress('Generating content briefs...');
    for (const cluster of topicClusters) {
      // Pillar content brief
      const pillarBrief: ContentBrief = {
        id: `brief-${cluster.id}`,
        title: `The Complete Guide to ${cluster.pillarTopic}`,
        keywords: [cluster.pillarKeyword, ...cluster.supportingTopics.flatMap(t => t.keywords).slice(0, 5)],
        outline: [
          'Introduction',
          `What is ${cluster.pillarTopic}?`,
          'Key Benefits',
          'Best Practices',
          'Common Challenges',
          'Conclusion'
        ],
        targetWordCount: 2500,
        contentType: 'pillar',
        priority: 'high'
      };
      contentBriefs.push(pillarBrief);
      await callbacks.onContentBrief(pillarBrief);

      // Supporting content briefs
      for (const supporting of cluster.supportingTopics.slice(0, 3)) {
        const brief: ContentBrief = {
          id: `brief-${cluster.id}-${supporting.topic.toLowerCase().replace(/\s+/g, '-')}`,
          title: `How to ${supporting.topic}`,
          keywords: supporting.keywords,
          outline: [
            'Introduction',
            'Step-by-step guide',
            'Tips and best practices',
            'Conclusion'
          ],
          targetWordCount: 1500,
          contentType: 'how-to',
          priority: 'medium'
        };
        contentBriefs.push(brief);
        await callbacks.onContentBrief(brief);
      }
    }

    // 3. Generate internal linking suggestions
    await callbacks.onProgress('Generating internal linking suggestions...');
    for (const edge of input.ontology.edges) {
      const fromNode = input.ontology.nodes.find(n => n.id === edge.from);
      const toNode = input.ontology.nodes.find(n => n.id === edge.to);
      
      if (fromNode && toNode) {
        const suggestion: InternalLinkingSuggestion = {
          fromTopic: fromNode.label,
          toTopic: toNode.label,
          anchorText: toNode.keywords?.[0] || toNode.label,
          relevanceScore: edge.weight || 0.5
        };
        internalLinkingSuggestions.push(suggestion);
        await callbacks.onLinkingSuggestion(suggestion);
      }
    }

    await callbacks.onProgress('Content creation plan complete');

    return {
      topicClusters,
      contentBriefs,
      internalLinkingSuggestions
    };
  }
}
