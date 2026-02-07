import type { AITextModelPort } from '@casys/application';
import type {
  BusinessContextAnalysisAgentPort,
  BusinessContextAnalysisInput,
  BusinessContextAnalysisResult,
} from '@casys/application';

/**
 * Échappe les caractères spéciaux XML pour injection sécurisée dans POML
 */
function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
// TODO il pas besoin de l'espape xml car jina s'en occupe, injecter le vrai logger, découper le prompt dans un poml
/**
 * Agent d'analyse de contexte business.
 * Infère industry, targetAudience, contentType et businessDescription
 * à partir des données domaine (DataForSEO).
 */
export class BusinessContextAnalysisAgent implements BusinessContextAnalysisAgentPort {
  constructor(private readonly aiModel: AITextModelPort) {}

  async analyze(input: BusinessContextAnalysisInput): Promise<BusinessContextAnalysisResult> {
    const { domain, topKeywords: _topKeywords = [], organicTraffic: _organicTraffic, backlinksCount: _backlinksCount, language = 'en', pagesSummary } = input;

    // Toujours utiliser pagesSummary (DataForSEO topKeywords ne marchent pas bien)
    const contentSection = pagesSummary
      ? `<pages_content>
${escapeXml(pagesSummary)}
</pages_content>`
      : `<note>No pages content available. Infer from domain name only.</note>`;

    const prompt = `<poml version="1.0">
<context>
You are a business context analyst. Infer the industry, target audience, content type, business description, site type, and detailed personas from website content.
</context>

<input>
<domain>${input.domain.xmlSafe}</domain>
${contentSection}
</input>

<task>
Analyze the business context and generate:
1. Basic info: industry, targetAudience, contentType, businessDescription, siteType
2. Detailed personas (2-3 max): specific audience segments with demographics, pain points, motivations, and messaging angles
</task>

<output_format>
Output ONLY valid JSON (no markdown, no code blocks):
{
  "industry": "string",
  "targetAudience": "string",
  "contentType": "string",
  "businessDescription": "string",
  "siteType": "saas|e-commerce|blog|corporate|marketplace|portfolio|other",
  "personas": [
    {
      "category": "Segment name",
      "archetype": "Persona archetype",
      "emoji": "🎯",
      "profile": {
        "demographics": "Age range, professional status, company size",
        "psychographics": "Values, lifestyle, work style",
        "techSavviness": "Beginner|Intermediate|Advanced"
      },
      "painPoints": ["Pain point 1", "Pain point 2", "Pain point 3"],
      "motivations": ["Motivation 1", "Motivation 2", "Motivation 3"],
      "messagingAngle": "Value proposition for this persona"
    }
  ]
}
</output_format>

<constraints>
1. <language>${language}</language>
2. **Industry**: Be specific (e.g., "SaaS - Project Management", "E-commerce - Fashion", "Professional Services - Accounting")
3. **Target Audience**: General summary (e.g., "SMBs and freelancers in creative industries")
4. **Content Type**: Type of content (e.g., "blog", "documentation", "product pages", "case studies")
5. **Business Description**: 1-2 sentences describing what the business does and its value proposition
6. **Site Type**: Choose most accurate: saas, e-commerce, blog, corporate, marketplace, portfolio, other
7. **Personas**: Generate 2-3 specific audience segments maximum
8. **Pain Points**: 3-5 specific problems this persona faces
9. **Motivations**: 3-5 goals or desires driving this persona
10. **Messaging Angle**: A compelling value proposition statement (1 sentence) for this persona
11. **Emoji**: Choose relevant emoji representing each persona (🎯, 🎨, 💼, 🏗️, 👨‍💻, etc.)
</constraints>

<examples>
Example for a project management SaaS:
{
  "industry": "SaaS - Project Management",
  "targetAudience": "SMBs and creative agencies",
  "contentType": "product pages + blog",
  "businessDescription": "Cloud-based project management platform helping creative teams collaborate and deliver projects on time.",
  "siteType": "saas",
  "personas": [
    {
      "category": "Creative Agency Managers",
      "archetype": "The Organized Visionary",
      "emoji": "🎨",
      "profile": {
        "demographics": "30-45 years old, managing 5-20 person teams",
        "psychographics": "Values creativity and efficiency, data-driven decision maker",
        "techSavviness": "Intermediate"
      },
      "painPoints": [
        "Struggling to track multiple client projects simultaneously",
        "Team members miss deadlines due to poor visibility",
        "Client communication scattered across tools"
      ],
      "motivations": [
        "Deliver exceptional client work consistently",
        "Build a scalable agency operation",
        "Reduce administrative overhead"
      ],
      "messagingAngle": "Manage all your creative projects in one place and never miss a deadline again"
    }
  ]
}
</examples>
</poml>`;

    try {
      console.debug('[BusinessContextAnalysisAgent] Analyzing domain context', { domain });
      const response = await this.aiModel.generateText(prompt);
      const cleaned = this.extractJson(response);
      const parsed = JSON.parse(cleaned);

      // Validation stricte des champs de base
      if (
        typeof parsed.industry !== 'string' ||
        typeof parsed.targetAudience !== 'string' ||
        typeof parsed.contentType !== 'string' ||
        typeof parsed.businessDescription !== 'string'
      ) {
        throw new Error('Invalid BusinessContextAnalysisResult structure');
      }

      // Validation optionnelle des personas
      const personas = 'personas' in parsed && Array.isArray(parsed.personas) ? parsed.personas : undefined;
      const siteType = 'siteType' in parsed && typeof parsed.siteType === 'string' ? String(parsed.siteType).trim() : undefined;

      console.debug('[BusinessContextAnalysisAgent] Context inferred', {
        industry: parsed.industry,
        targetAudience: parsed.targetAudience,
        personasCount: personas?.length ?? 0,
      });

      return {
        industry: String(parsed.industry).trim() || 'Generic',
        targetAudience: String(parsed.targetAudience).trim() || 'General',
        contentType: String(parsed.contentType).trim() || 'article',
        businessDescription: String(parsed.businessDescription).trim() || `Website: ${domain}`,
        siteType,
        personas,
        rawAnalysis: cleaned, // Store the raw JSON for full display
      };
    } catch (error) {
      console.warn('[BusinessContextAnalysisAgent] Failed to infer context, using fallback', error);
      // Fallback robuste
      return {
        industry: 'Generic',
        targetAudience: 'General',
        contentType: 'article',
        businessDescription: `Website: ${domain}`,
      };
    }
  }

  private extractJson(text: string): string {
    // Extraire JSON depuis markdown code blocks ou texte brut
    const match = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/.exec(text) || /(\{[\s\S]*\})/.exec(text);
    return match ? match[1].trim() : text.trim();
  }
}
