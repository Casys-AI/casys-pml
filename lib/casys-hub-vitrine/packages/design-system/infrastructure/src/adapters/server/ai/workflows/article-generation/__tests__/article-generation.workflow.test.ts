import { describe, it, expect, beforeEach } from 'vitest';
import { ArticleGenerationWorkflow } from '../article-generation.workflow';
import type { AITextModelPort, PromptTemplatePort } from '@casys/application';

describe('ArticleGenerationWorkflow', () => {
  let workflow: ArticleGenerationWorkflow;
  let generatedSections: string[] = [];
  let aiCallsLog: string[] = [];

  beforeEach(() => {
    generatedSections = [];
    aiCallsLog = [];

    // Mock AI qui retourne du contenu simple
    const mockAI: AITextModelPort = {
      generateText: async (prompt: string) => {
        // Log pour debug
        if (prompt.includes('Relecture globale')) {
          aiCallsLog.push('reviewArticle');
          return JSON.stringify({ reviews: [] }); // Aucune correction
        }

        if (prompt.includes('Rédacteur (réécriture complète)') || prompt.includes('Rédacteur (patch ciblé)')) {
          aiCallsLog.push('refineSections');
          return JSON.stringify({ content: '# Refined\n\nContenu corrigé.' });
        }

        // writeSection
        aiCallsLog.push('writeSection');
        const sectionIndex = generatedSections.length;
        const content = `# Section ${sectionIndex + 1}\n\nContenu de test pour la section ${sectionIndex + 1}.`;
        generatedSections.push(content);

        return JSON.stringify({
          content,
          usedTopics: [],
          usedArticles: [],
          metadata: { estimatedReadTime: 2, keyTopics: [] },
        });
      },
    };

    // Mock template
    const mockTemplate: PromptTemplatePort = {
      loadTemplate: async () => '<poml>Mock template</poml>',
    };

    workflow = new ArticleGenerationWorkflow({
      aiModel: mockAI,
      promptTemplate: mockTemplate,
    });
  });

  it('should generate 3 sections without validateSection node', async () => {
    const result = await workflow.execute(
      {
        tenantId: 'test',
        projectId: 'test',
        language: 'fr',
        outline: {
          article: {
            id: 'test-article-1',
            title: 'Article Test',
          },
          sections: [
            { id: 'sec-1', title: 'Intro', position: 0, level: 2, articleId: 'test-article-1', content: '' },
            { id: 'sec-2', title: 'Corps', position: 1, level: 2, articleId: 'test-article-1', content: '' },
            { id: 'sec-3', title: 'Conclusion', position: 2, level: 2, articleId: 'test-article-1', content: '' },
          ],
        },
      },
      {
        templatePath: 'test.poml',
        contentFormat: 'mdx',
        maxAttempts: 1,
      }
    );

    // Assertions
    expect(result.sections).toHaveLength(3);
    expect(result.status).toBe('completed');
    expect(generatedSections).toHaveLength(3);

    // Vérifier workflow: 3 writeSection + 1 reviewArticle
    expect(aiCallsLog.filter(c => c === 'writeSection')).toHaveLength(3);
    expect(aiCallsLog.filter(c => c === 'reviewArticle')).toHaveLength(1);

    // Vérifier que validateSection n'existe plus (pas de call validation micro)
    expect(aiCallsLog.every(c => c !== 'validateSection')).toBe(true);
  });

  it('should handle H2/H3 hierarchy with parentSectionId', async () => {
    const result = await workflow.execute(
      {
        tenantId: 'test',
        projectId: 'test',
        language: 'fr',
        outline: {
          article: {
            id: 'test-article-2',
            title: 'Article Hiérarchique',
          },
          sections: [
            { id: 'sec-1', title: 'Section Parent', position: 0, level: 2, articleId: 'test-article-2', content: '' },
            { id: 'sec-1-1', title: 'Subsection 1', position: 1, level: 3, parentSectionId: 'sec-1', articleId: 'test-article-2', content: '' },
            { id: 'sec-1-2', title: 'Subsection 2', position: 2, level: 3, parentSectionId: 'sec-1', articleId: 'test-article-2', content: '' },
          ],
        },
      },
      {
        templatePath: 'test.poml',
        contentFormat: 'mdx',
      }
    );

    expect(result.sections).toHaveLength(3);

    // Vérifier que les parentSectionId sont préservés
    const subsection1 = result.sections.find(s => s.id === 'sec-1-1');
    const subsection2 = result.sections.find(s => s.id === 'sec-1-2');

    expect(subsection1?.parentSectionId).toBe('sec-1');
    expect(subsection2?.parentSectionId).toBe('sec-1');
  });

  it('should respect recursionLimit=100 with 15 sections', async () => {
    const sections = Array.from({ length: 15 }, (_, i) => ({
      id: `sec-${i}`,
      title: `Section ${i}`,
      position: i,
      level: 2,
      articleId: 'test-article-3',
      content: '',
    }));

    const result = await workflow.execute(
      {
        tenantId: 'test',
        projectId: 'test',
        language: 'fr',
        outline: {
          article: {
            id: 'test-article-3',
            title: 'Long Article',
          },
          sections,
        },
      },
      { templatePath: 'test.poml', contentFormat: 'mdx' }
    );

    expect(result.sections).toHaveLength(15);
    expect(result.status).toBe('completed');

    // 15 sections × 4 nœuds (write/summarize/persist/decide) + review + plan + finalize = ~65 nœuds
    // Devrait passer avec recursionLimit=100
    expect(aiCallsLog.filter(c => c === 'writeSection')).toHaveLength(15);
  });

  it('should handle review cycle with corrections (maxAttempts=2)', async () => {
    let reviewCalls = 0;

    const mockAIWithReview: AITextModelPort = {
      generateText: async (prompt: string) => {
        if (prompt.includes('Relecture globale')) {
          reviewCalls++;
          if (reviewCalls === 1) {
            // 1ère review : demander 1 patch
            return JSON.stringify({
              reviews: [
                {
                  sectionId: 'sec-1',
                  action: 'patch',
                  instructions: 'Ajouter une transition au début de la section',
                },
              ],
            });
          }
          // 2e review : OK
          return JSON.stringify({ reviews: [] });
        }

        if (prompt.includes('Rédacteur (patch ciblé)')) {
          return JSON.stringify({ content: '# Test\n\nContenu corrigé avec transition.' });
        }

        return JSON.stringify({
          content: '# Test\n\nContenu test.',
          usedTopics: [],
          usedArticles: [],
          metadata: { estimatedReadTime: 2, keyTopics: [] },
        });
      },
    };

    const wf = new ArticleGenerationWorkflow({
      aiModel: mockAIWithReview,
      promptTemplate: { loadTemplate: async () => '<poml>test</poml>' },
    });

    const result = await wf.execute(
      {
        tenantId: 'test',
        projectId: 'test',
        language: 'fr',
        outline: {
          article: {
            id: 'test-article-4',
            title: 'Test Review',
          },
          sections: [{ id: 'sec-1', title: 'Intro', position: 0, level: 2, articleId: 'test-article-4', content: '' }],
        },
      },
      { templatePath: 'test.poml', contentFormat: 'mdx', maxAttempts: 2 }
    );

    // Devrait avoir fait au moins 1 review (peut en faire 2 si le patch déclenche une 2e review)
    expect(reviewCalls).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe('completed');
  });

  it('should enforce maxAttempts=1 and skip corrections after first attempt', async () => {
    let reviewCalls = 0;

    const mockAIWithReview: AITextModelPort = {
      generateText: async (prompt: string) => {
        if (prompt.includes('Relecture globale')) {
          reviewCalls++;
          // Toujours demander des corrections
          return JSON.stringify({
            reviews: [
              {
                sectionId: 'sec-1',
                action: 'patch',
                instructions: 'Améliorer la transition',
              },
            ],
          });
        }

        return JSON.stringify({
          content: '# Test\n\nContenu test.',
          usedTopics: [],
          usedArticles: [],
          metadata: { estimatedReadTime: 2, keyTopics: [] },
        });
      },
    };

    const wf = new ArticleGenerationWorkflow({
      aiModel: mockAIWithReview,
      promptTemplate: { loadTemplate: async () => '<poml>test</poml>' },
    });

    const result = await wf.execute(
      {
        tenantId: 'test',
        projectId: 'test',
        language: 'fr',
        outline: {
          article: {
            id: 'test-article-5',
            title: 'Test MaxAttempts',
          },
          sections: [{ id: 'sec-1', title: 'Intro', position: 0, level: 2, articleId: 'test-article-5', content: '' }],
        },
      },
      { templatePath: 'test.poml', contentFormat: 'mdx', maxAttempts: 1 }
    );

    // Avec maxAttempts=1, ne devrait faire qu'1 seule review puis forcer finalize
    expect(reviewCalls).toBe(1);
    expect(result.status).toBe('completed');
  });

  it('should complete successfully with no sectionHierarchyAdapter (no HAS_SUBSECTION)', async () => {
    // Test que le workflow fonctionne même sans sectionHierarchyAdapter
    // (pas de création de relations HAS_SUBSECTION mais ça ne crash pas)
    const result = await workflow.execute(
      {
        tenantId: 'test',
        projectId: 'test',
        language: 'fr',
        outline: {
          article: {
            id: 'test-article-6',
            title: 'Test Sans Hierarchy',
          },
          sections: [
            { id: 'sec-1', title: 'Parent', position: 0, level: 2, articleId: 'test-article-6', content: '' },
            { id: 'sec-1-1', title: 'Child', position: 1, level: 3, parentSectionId: 'sec-1', articleId: 'test-article-6', content: '' },
          ],
        },
      },
      { templatePath: 'test.poml', contentFormat: 'mdx' }
    );

    expect(result.sections).toHaveLength(2);
    expect(result.status).toBe('completed');
  });
});
