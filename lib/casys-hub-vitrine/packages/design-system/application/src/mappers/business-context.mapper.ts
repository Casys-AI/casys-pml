import type { BusinessContextDTO, PersonaProfileDTO, ProjectConfig } from '@casys/shared';
import type { BusinessContext, PersonaProfile, ProjectSeoSettings } from '@casys/core';

/**
 * Build BusinessContext V3 (core) from ProjectConfig + ProjectSeoSettings
 * - settings takes precedence over projectConfig.businessContext values
 * - trims strings and applies safe defaults
 */
export function buildBusinessContextV3(
  projectConfig: ProjectConfig | undefined,
  settings: ProjectSeoSettings | undefined
): BusinessContext {
  interface PersonaInput {
    category?: string;
    archetype?: string;
    emoji?: string;
    profile?: { demographics?: string; psychographics?: string; techSavviness?: string };
    painPoints?: unknown[];
    motivations?: unknown[];
    messagingAngle?: string;
  }

  interface BCInput {
    targetAudience?: string;
    industry?: string;
    businessDescription?: string;
    contentType?: string;
    siteType?: string;
    personas?: PersonaInput[];
  }

  const bc = projectConfig?.businessContext as Partial<BCInput> | undefined;

  const targetAudience = String(settings?.targetAudience ?? bc?.targetAudience ?? '').trim();
  const industry = String(settings?.industry ?? bc?.industry ?? '').trim();
  const businessDescription = String(
    settings?.businessDescription ?? bc?.businessDescription ?? ''
  ).trim();
  const contentType = String(settings?.contentType ?? bc?.contentType ?? 'article').trim();
  const siteType = bc?.siteType ? String(bc.siteType).trim() : undefined;

  const personas: PersonaProfile[] = Array.isArray(bc?.personas)
    ? bc.personas.map(
        (p): PersonaProfile => ({
          category: String(p?.category ?? '').trim(),
          archetype: String(p?.archetype ?? '').trim(),
          emoji: p?.emoji,
          profile: {
            demographics: String(p?.profile?.demographics ?? '').trim(),
            psychographics: String(p?.profile?.psychographics ?? '').trim(),
            techSavviness: String(p?.profile?.techSavviness ?? 'Intermédiaire').trim(),
          },
          painPoints: Array.isArray(p?.painPoints) ? p.painPoints.map(s => String(s).trim()) : [],
          motivations: Array.isArray(p?.motivations)
            ? p.motivations.map(s => String(s).trim())
            : [],
          messagingAngle: String(p?.messagingAngle ?? '').trim(),
        })
      )
    : [];

  return {
    targetAudience,
    industry,
    businessDescription,
    contentType,
    siteType,
    personas,
  };
}

/**
 * Map BusinessContext (core) -> BusinessContextDTO (shared)
 * Optionnellement, accepte un tableau de personas déjà au format DTO.
 */
export function mapBusinessContextV3ToDTO(
  bc: BusinessContext,
  personas?: PersonaProfileDTO[]
): BusinessContextDTO {
  const toPersonaDTO = (p: PersonaProfile): PersonaProfileDTO => ({
    category: p.category,
    archetype: p.archetype,
    emoji: p.emoji,
    profile: {
      demographics: p.profile.demographics,
      psychographics: p.profile.psychographics,
      techSavviness: p.profile.techSavviness,
    },
    painPoints: p.painPoints,
    motivations: p.motivations,
    messagingAngle: p.messagingAngle,
  });

  return {
    industry: bc.industry,
    siteType: bc.siteType,
    targetAudience: bc.targetAudience,
    businessDescription: bc.businessDescription,
    contentType: bc.contentType,
    personas: personas ?? bc.personas?.map(toPersonaDTO),
  };
}
