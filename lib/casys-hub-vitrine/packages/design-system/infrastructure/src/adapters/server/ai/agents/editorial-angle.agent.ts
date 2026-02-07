import type {
  AITextModelPort,
  EditorialAngleAgentParams,
  EditorialAngleAgentPort,
} from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Minimal agent to choose a single editorial angle from SeoBrief + article context.
 * No fallback: throws if model output is empty or invalid.
 */
export class EditorialAngleAgent implements EditorialAngleAgentPort {
  private readonly logger = createLogger('EditorialAngleAgent');
  constructor(private readonly aiTextModel: AITextModelPort) {}

  async generateAngle(params: EditorialAngleAgentParams): Promise<{ angle: string }> {
    const { seoBrief, businessContext, language, articleContext } = params;
    const maxLen = Math.max(20, Math.min(params.maxLen ?? 160, 480));

    // Build keywords list from seoBrief (always provided)
    const ek = seoBrief.keywordTags
      .map(t => String(t.label).trim())
      .filter(Boolean)
      .join(', ');

    // SEO analysis data (always provided; may be minimal)
    const uq = (seoBrief.userQuestions ?? []).join(' • ');
    
    // Blog strategy v2: read from recommendations.seo, fallback to legacy seoRecommendations
    const seoRecs: string[] = seoBrief.recommendations?.seo ?? seoBrief.seoRecommendations ?? [];
    const sr = seoRecs.join(' • ');
    
    // Blog strategy v2: handle structured contentRecommendations (ContentRecommendationsDTO format)
    const contentRecs = typeof seoBrief.contentRecommendations === 'object' && !Array.isArray(seoBrief.contentRecommendations)
      ? [...((seoBrief.contentRecommendations as any).articleTypes ?? []), ...((seoBrief.contentRecommendations as any).contentAngles ?? [])]
      : (seoBrief.contentRecommendations ?? []);
    const cr = (contentRecs as string[]).join(' • ');
    
    // Blog strategy v2: flatten ContentGap[] to strings
    const contentGapsFlat = (seoBrief.contentGaps ?? []).map(g => 
      typeof g === 'string' ? g : `${g.keyword}: ${g.gap}`
    );
    const cg = contentGapsFlat.join(' • ');
    const searchIntent = seoBrief.searchIntent ?? 'informational';
    const searchConfidence = seoBrief.searchConfidence ?? 0.5;

    const sect = (articleContext?.sectionTitles ?? []).join(' | ');
    const domains = (articleContext?.externalDomains ?? []).join(', ');

    const promptLines = [
      `Return ONLY ONE short editorial angle (<= ${maxLen} chars) in ${language}.`,
      `No emojis, hashtags, or decorative quotes. Single line.`,
      `Must align with search intent and content type.`,
    ];

    // Add SEO context (seoBrief always provided)
    promptLines.push(`Search intent: ${searchIntent} (conf ${searchConfidence})`);
    if (uq) promptLines.push(`User questions: ${uq}`);
    if (sr) promptLines.push(`SEO recos: ${sr}`);
    if (cr) promptLines.push(`Content recos: ${cr}`);
    if (cg) promptLines.push(`Content gaps: ${cg}`);

    // Keywords and article context (always present)
    promptLines.push(`Top keywords: ${ek}`);
    promptLines.push(`Article title: ${articleContext?.title ?? 'n/a'}`);
    promptLines.push(`Section titles: ${sect || 'n/a'}`);
    promptLines.push(`External domains: ${domains || 'n/a'}`);
    promptLines.push(`Audience: ${businessContext.targetAudience}`);
    promptLines.push(`Industry: ${businessContext.industry}`);
    promptLines.push(`Description: ${businessContext.businessDescription}`);
    promptLines.push(`Content type: ${businessContext.contentType ?? 'article'}`);
    promptLines.push(`Angle:`);

    const prompt = promptLines.join('\n');

    const raw = await this.aiTextModel.generateText(prompt);
    if (!raw || typeof raw !== 'string') {
      throw new Error('[EditorialAngleAgent] empty model response');
    }
    // Normalize: keep first line, trim, enforce length
    const line = raw.split(/\r?\n/)[0]?.trim() ?? '';
    const cleaned = line.replace(/["“”]/g, '').trim();
    if (!cleaned) throw new Error('[EditorialAngleAgent] produced empty angle');
    const angle = cleaned.length > maxLen ? cleaned.slice(0, maxLen).trim() : cleaned;
    if (!angle) throw new Error('[EditorialAngleAgent] angle invalid after trim');

    return { angle };
  }
}

export function createEditorialAngleAgent(aiTextModel: AITextModelPort): EditorialAngleAgent {
  return new EditorialAngleAgent(aiTextModel);
}
