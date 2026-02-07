import * as fsPromises from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MdxParserService } from '../mdx-parser.adapter';

// Mock pour fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('MdxParserService - Section Recognition (All Levels)', () => {
  let service: MdxParserService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MdxParserService();
  });

  it('should recognize all 6 levels of markdown headers', async () => {
    const mdxContent = `---
title: All Levels Test
---

# Level 1
Content H1

## Level 2
Content H2

### Level 3
Content H3

#### Level 4
Content H4

##### Level 5
Content H5

###### Level 6
Content H6
`;
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const result = await service.parseArticleStructure('/path/to/all-levels.mdx');

    expect(result.sections.length).toBe(6);
    
    const h1 = result.sections.find(s => s.title === 'Level 1');
    const h2 = result.sections.find(s => s.title === 'Level 2');
    const h3 = result.sections.find(s => s.title === 'Level 3');
    const h4 = result.sections.find(s => s.title === 'Level 4');
    const h5 = result.sections.find(s => s.title === 'Level 5');
    const h6 = result.sections.find(s => s.title === 'Level 6');

    expect(h1?.level).toBe(1);
    expect(h2?.level).toBe(2);
    expect(h3?.level).toBe(3);
    expect(h4?.level).toBe(4);
    expect(h5?.level).toBe(5);
    expect(h6?.level).toBe(6);
  });

  it('should handle document starting with H2 (no H1)', async () => {
    const mdxContent = `---
title: Orphan H2 Test
---

## First Section (H2)
This document starts with H2.

### Subsection (H3)
Under the H2.
`;
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const result = await service.parseArticleStructure('/path/to/orphan-h2.mdx');

    expect(result.sections.length).toBe(2);
    
    const h2 = result.sections.find(s => s.title === 'First Section (H2)');
    const h3 = result.sections.find(s => s.title === 'Subsection (H3)');

    expect(h2).toBeDefined();
    expect(h2?.level).toBe(2);
    expect(h2?.parentSectionId).toBeUndefined(); // Pas de parent H1

    expect(h3).toBeDefined();
    expect(h3?.level).toBe(3);
    expect(h3?.parentSectionId).toBe(h2?.id); // Parent est H2
  });

  it('should handle document starting with H3 (no H1 or H2)', async () => {
    const mdxContent = `---
title: Orphan H3 Test
---

### First Section (H3)
This document starts with H3.

#### Subsection (H4)
Under the H3.
`;
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const result = await service.parseArticleStructure('/path/to/orphan-h3.mdx');

    expect(result.sections.length).toBe(2);
    
    const h3 = result.sections.find(s => s.title === 'First Section (H3)');
    const h4 = result.sections.find(s => s.title === 'Subsection (H4)');

    expect(h3).toBeDefined();
    expect(h3?.level).toBe(3);
    expect(h3?.parentSectionId).toBeUndefined(); // Pas de parent

    expect(h4).toBeDefined();
    expect(h4?.level).toBe(4);
    expect(h4?.parentSectionId).toBe(h3?.id); // Parent est H3
  });

  it('should correctly distinguish between ### and ####', async () => {
    const mdxContent = `---
title: Distinction Test
---

# Main

### Three Hashes
This is H3.

#### Four Hashes
This is H4.
`;
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const result = await service.parseArticleStructure('/path/to/distinction.mdx');

    const h3 = result.sections.find(s => s.title === 'Three Hashes');
    const h4 = result.sections.find(s => s.title === 'Four Hashes');

    expect(h3?.level).toBe(3);
    expect(h4?.level).toBe(4);
    expect(h4?.parentSectionId).toBe(h3?.id);
  });

  it('should handle complex nested hierarchy', async () => {
    const mdxContent = `---
title: Complex Hierarchy
---

# H1 Root

## H2 Under H1

### H3 Under H2

#### H4 Under H3

##### H5 Under H4

###### H6 Under H5

##### Another H5 (sibling)

## Another H2 (sibling to first H2)
`;
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const result = await service.parseArticleStructure('/path/to/complex.mdx');

    const h1 = result.sections.find(s => s.title === 'H1 Root');
    const h2_1 = result.sections.find(s => s.title === 'H2 Under H1');
    const h3 = result.sections.find(s => s.title === 'H3 Under H2');
    const h4 = result.sections.find(s => s.title === 'H4 Under H3');
    const h5_1 = result.sections.find(s => s.title === 'H5 Under H4');
    const h6 = result.sections.find(s => s.title === 'H6 Under H5');
    const h5_2 = result.sections.find(s => s.title === 'Another H5 (sibling)');
    const h2_2 = result.sections.find(s => s.title === 'Another H2 (sibling to first H2)');

    // Vérifier la hiérarchie
    expect(h1?.parentSectionId).toBeUndefined();
    expect(h2_1?.parentSectionId).toBe(h1?.id);
    expect(h3?.parentSectionId).toBe(h2_1?.id);
    expect(h4?.parentSectionId).toBe(h3?.id);
    expect(h5_1?.parentSectionId).toBe(h4?.id);
    expect(h6?.parentSectionId).toBe(h5_1?.id);
    expect(h5_2?.parentSectionId).toBe(h4?.id); // Remonte au H4 parent
    expect(h2_2?.parentSectionId).toBe(h1?.id); // Remonte au H1 parent
  });

  it('should handle headers with leading/trailing spaces', async () => {
    const mdxContent = `---
title: Spaces Test
---

#   H1 with spaces   

##  H2 with spaces  

###   H3 with spaces
`;
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const result = await service.parseArticleStructure('/path/to/spaces.mdx');

    const h1 = result.sections.find(s => s.level === 1);
    const h2 = result.sections.find(s => s.level === 2);
    const h3 = result.sections.find(s => s.level === 3);

    // Les titres doivent être trimés
    expect(h1?.title).toBe('H1 with spaces');
    expect(h2?.title).toBe('H2 with spaces');
    expect(h3?.title).toBe('H3 with spaces');
  });

  it('should preserve section content correctly', async () => {
    const mdxContent = `---
title: Content Test
---

# Section 1

This is content for section 1.
Multiple lines here.

## Section 2

Content for section 2.
`;
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const result = await service.parseArticleStructure('/path/to/content.mdx');

    const s1 = result.sections.find(s => s.title === 'Section 1');
    const s2 = result.sections.find(s => s.title === 'Section 2');

    expect(s1?.content).toContain('This is content for section 1');
    expect(s1?.content).toContain('Multiple lines here');
    expect(s2?.content).toContain('Content for section 2');
  });

  it('should handle mixed levels without strict hierarchy', async () => {
    const mdxContent = `---
title: Mixed Levels
---

# H1

#### H4 directly under H1 (skipping H2 and H3)

## H2 after H4

##### H5 under H2 (skipping H3 and H4)
`;
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const result = await service.parseArticleStructure('/path/to/mixed.mdx');

    const h1 = result.sections.find(s => s.title === 'H1');
    const h4 = result.sections.find(s => s.title === 'H4 directly under H1 (skipping H2 and H3)');
    const h2 = result.sections.find(s => s.title === 'H2 after H4');
    const h5 = result.sections.find(s => s.title === 'H5 under H2 (skipping H3 and H4)');

    // H4 devrait avoir H1 comme parent (pas de H2/H3 disponible)
    expect(h4?.parentSectionId).toBe(h1?.id);
    
    // H2 devrait avoir H1 comme parent
    expect(h2?.parentSectionId).toBe(h1?.id);
    
    // H5 devrait avoir H2 comme parent (le plus proche disponible)
    expect(h5?.parentSectionId).toBe(h2?.id);
  });
});
