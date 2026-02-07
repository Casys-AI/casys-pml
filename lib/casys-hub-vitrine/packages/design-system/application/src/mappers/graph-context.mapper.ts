import type { SectionContextNeighborDTO, SectionGraphContextDTO } from '@casys/shared';
import type { SectionNode } from '@casys/core';

export interface NeighborSummary {
  title: string;
  position: number;
  summary: string;
}

export interface GraphContextBuilderInput {
  outline: {
    title?: string;
    summary?: string;
    sections?: { title?: string; description?: string }[];
  };
  currentIndex: number;
  generatedSections: SectionNode[];
  current: SectionNode;
  neighbors: NeighborSummary[];
}

export class GraphContextBuilder {
  build(input: GraphContextBuilderInput): string {
    const { outline, currentIndex, generatedSections, current, neighbors } = input;
    const lines: string[] = [];

    // Article
    if (outline.title) lines.push(`# Article: ${outline.title}`);
    if (outline.summary) lines.push(`Summary: ${outline.summary}`);

    // No external topics rendering here; this builder focuses on graph neighbors formatting

    // Outline complet
    const allSections = Array.isArray(outline.sections) ? outline.sections : [];
    if (allSections.length) {
      lines.push('Outline:');
      allSections.forEach((s, idx) => lines.push(`- [${idx}] ${s?.title ?? ''}`));
    }

    // Contexte hiérarchique : parents, siblings, et séquentiels
    const hierarchyLines: string[] = [];

    // 1) Remonter la hiérarchie (parent, grand-parent...)
    let parentId = current.parentSectionId;
    const ancestors: SectionNode[] = [];
    while (parentId && ancestors.length < 3) {
      const parent = generatedSections.find(s => s.id === parentId);
      if (parent) {
        ancestors.push(parent);
        parentId = parent.parentSectionId;
      } else {
        break;
      }
    }

    if (ancestors.length > 0) {
      hierarchyLines.push('Hierarchy (parent sections):');
      ancestors.reverse().forEach(p => {
        const level = 'H' + p.level;
        // Chercher le résumé correspondant
        const neighborSummary = neighbors.find(n => n.position === p.position);
        const summary = neighborSummary?.summary ?? '';
        hierarchyLines.push(`- [${level}] ${p.title}${summary ? ': ' + summary : ''}`);
      });
    }

    // 2) Siblings déjà générés (même parent, même niveau)
    const siblings = generatedSections.filter(
      s =>
        s.parentSectionId === current.parentSectionId &&
        s.level === current.level &&
        s.position !== current.position &&
        s.position < current.position
    );
    if (siblings.length > 0) {
      hierarchyLines.push('Sibling sections (same level, already written):');
      siblings.slice(-2).forEach(sib => {
        // Chercher le résumé correspondant
        const neighborSummary = neighbors.find(n => n.position === sib.position);
        const summary = neighborSummary?.summary ?? '';
        hierarchyLines.push(`- ${sib.title}${summary ? ': ' + summary : ''}`);
      });
    }

    // 3) Section séquentielle précédente (si différente du parent)
    const prevPos = currentIndex - 1;
    const prevSection = generatedSections.find(s => s.position === prevPos);
    if (prevSection && prevSection.id !== current.parentSectionId) {
      hierarchyLines.push('Previous section (sequential):');
      // Chercher le résumé correspondant
      const neighborSummary = neighbors.find(n => n.position === prevSection.position);
      const summary = neighborSummary?.summary ?? '';
      hierarchyLines.push(`- ${prevSection.title}${summary ? ': ' + summary : ''}`);
    }

    // 4) Section suivante planifiée (outline)
    const nextPos = currentIndex + 1;
    const nextOutline = allSections?.[nextPos];
    if (nextOutline?.description) {
      hierarchyLines.push('Next section (planned):');
      hierarchyLines.push(`- ${nextOutline.title}: ${nextOutline.description}`);
    } else if (nextOutline?.title) {
      hierarchyLines.push('Next section (planned):');
      hierarchyLines.push(`- ${nextOutline.title}`);
    }

    if (hierarchyLines.length) {
      lines.push(...hierarchyLines);
    }

    // Les résumés sont maintenant intégrés directement dans les sections hiérarchiques ci-dessus

    // Focus section courante
    lines.push(`Focus: [${current.position}] ${current.title}`);

    return lines.join('\n');
  }

  format(
    dto: SectionGraphContextDTO,
    extras?: { outlineSections?: { title?: string; description?: string }[] }
  ): string {
    const lines: string[] = [];
    if (dto.article?.title) lines.push(`# Article: ${dto.article.title}`);
    if (dto.article?.summary) lines.push(`Summary: ${dto.article.summary}`);
    else if (dto.article?.description) lines.push(`Summary: ${dto.article.description}`);


    const allSections = Array.isArray(extras?.outlineSections) ? extras.outlineSections : [];
    if (allSections.length) {
      lines.push('Outline:');
      allSections.forEach((s, idx) => lines.push(`- [${idx}] ${s?.title ?? ''}`));
    }

    const hierarchyLines: string[] = [];
    if (Array.isArray(dto.ancestors) && dto.ancestors.length > 0) {
      hierarchyLines.push('Hierarchy (parent sections):');
      dto.ancestors.forEach((p: SectionContextNeighborDTO) => {
        const level = p.level ? 'H' + p.level : 'H';
        const summary = p.summary ?? '';
        hierarchyLines.push(`- [${level}] ${p.title}${summary ? ': ' + summary : ''}`);
      });
    }

    if (Array.isArray(dto.siblings) && dto.siblings.length > 0) {
      hierarchyLines.push('Sibling sections (same level, already written):');
      dto.siblings.slice(-2).forEach((sib: SectionContextNeighborDTO) => {
        const summary = sib.summary ?? '';
        hierarchyLines.push(`- ${sib.title}${summary ? ': ' + summary : ''}`);
      });
    }

    if (dto.previous) {
      hierarchyLines.push('Previous section (sequential):');
      const summary = dto.previous.summary ?? '';
      hierarchyLines.push(`- ${dto.previous.title}${summary ? ': ' + summary : ''}`);
    }

    if (dto.nextPlanned?.title) {
      hierarchyLines.push('Next section (planned):');
      if (dto.nextPlanned.description) {
        hierarchyLines.push(`- ${dto.nextPlanned.title}: ${dto.nextPlanned.description}`);
      } else {
        hierarchyLines.push(`- ${dto.nextPlanned.title}`);
      }
    }

    if (hierarchyLines.length) lines.push(...hierarchyLines);

    lines.push(`Focus: [${dto.current.position}] ${dto.current.title}`);
    return lines.join('\n');
  }
}
