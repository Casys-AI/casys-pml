/**
 * Tests for Text Fragment Utilities (Fuzzy Context Matching Version)
 */

import { describe, it, expect } from 'vitest';
import type { TextFragment } from '@casys/core';
import {
  applyTextFragment,
  applyTextFragments,
  extractContext,
  createTextFragmentWithContext,
  hasValidContext,
  splitLines,
  joinLines,
} from '../text-fragment.utils';

describe('applyTextFragment with fuzzy context', () => {
  const sampleContent = `Introduction paragraph
Section heading
First paragraph of the section.
Second paragraph with more content.
Third paragraph concluding.`;

  it('should apply fragment with exact context match', () => {
    const fragment: TextFragment = {
      id: 'fragment-1',
      sectionId: 'section-1',
      content: 'Modified first paragraph.',
      position: 1,
      metadata: {
        contextBefore: ['Section heading'],
        target: 'First paragraph of the section.',
        contextAfter: ['Second paragraph with more content.'],
      },
    } as TextFragment;

    const result = applyTextFragment(sampleContent, fragment);

    expect(result.applied).toBe(true);
    expect(result.content).toContain('Modified first paragraph.');
    expect(result.content).not.toContain('First paragraph of the section.');
  });

  it('should apply fragment with fuzzy context match (minor typo)', () => {
    const fragment: TextFragment = {
      id: 'fragment-1',
      sectionId: 'section-1',
      content: 'Corrected paragraph.',
      position: 1,
      metadata: {
        contextBefore: ['Section headin'], // typo: missing 'g'
        target: 'First paragraph of the section.',
        contextAfter: ['Second paragraph with more content'],
      },
    } as TextFragment;

    const result = applyTextFragment(sampleContent, fragment);

    expect(result.applied).toBe(true);
    expect(result.content).toContain('Corrected paragraph.');
  });

  it('should not apply when target is too different', () => {
    const fragment: TextFragment = {
      id: 'fragment-1',
      sectionId: 'section-1',
      content: 'Replacement',
      position: 1,
      metadata: {
        contextBefore: ['Section heading'],
        target: 'Completely different text',
        contextAfter: ['Second paragraph'],
      },
    } as TextFragment;

    const result = applyTextFragment(sampleContent, fragment);

    expect(result.applied).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('should not apply when context is too different', () => {
    const fragment: TextFragment = {
      id: 'fragment-1',
      sectionId: 'section-1',
      content: 'Replacement',
      position: 1,
      metadata: {
        contextBefore: ['Wrong context'],
        target: 'First paragraph of the section.',
        contextAfter: ['Wrong context'],
      },
    } as TextFragment;

    const result = applyTextFragment(sampleContent, fragment);

    expect(result.applied).toBe(false);
  });

  it('should handle fragment without context metadata', () => {
    const fragment: TextFragment = {
      id: 'fragment-1',
      sectionId: 'section-1',
      content: 'Replacement',
      position: 1,
    };

    const result = applyTextFragment(sampleContent, fragment);

    expect(result.applied).toBe(false);
    expect(result.reason).toContain('Missing target and context');
  });

  it('should work with empty contextBefore (start of section)', () => {
    const fragment: TextFragment = {
      id: 'fragment-1',
      sectionId: 'section-1',
      content: 'New introduction.',
      position: 0,
      metadata: {
        contextBefore: [],
        target: 'Introduction paragraph',
        contextAfter: ['Section heading'],
      },
    } as TextFragment;

    const result = applyTextFragment(sampleContent, fragment);

    expect(result.applied).toBe(true);
    expect(result.content).toContain('New introduction.');
  });

  it('should work with empty contextAfter (end of section)', () => {
    const fragment: TextFragment = {
      id: 'fragment-1',
      sectionId: 'section-1',
      content: 'New conclusion.',
      position: 6,
      metadata: {
        contextBefore: ['Second paragraph with more content.'],
        target: 'Third paragraph concluding.',
        contextAfter: [],
      },
    } as TextFragment;

    const result = applyTextFragment(sampleContent, fragment);

    expect(result.applied).toBe(true);
    expect(result.content).toContain('New conclusion.');
  });

  it('should preserve surrounding content', () => {
    const fragment: TextFragment = {
      id: 'fragment-1',
      sectionId: 'section-1',
      content: 'Modified',
      position: 1,
      metadata: {
        contextBefore: ['Section heading'],
        target: 'First paragraph of the section.',
        contextAfter: ['Second paragraph with more content.'],
      },
    } as TextFragment;

    const result = applyTextFragment(sampleContent, fragment);

    expect(result.applied).toBe(true);
    expect(result.content).toContain('Introduction paragraph');
    expect(result.content).toContain('Section heading');
    expect(result.content).toContain('Second paragraph');
    expect(result.content).toContain('Third paragraph');
  });

  it('should include match scores in result', () => {
    const fragment: TextFragment = {
      id: 'fragment-1',
      sectionId: 'section-1',
      content: 'Modified',
      position: 1,
      metadata: {
        contextBefore: ['Section heading'],
        target: 'First paragraph of the section.',
        contextAfter: ['Second paragraph with more content.'],
      },
    } as TextFragment;

    const result = applyTextFragment(sampleContent, fragment);

    expect(result.applied).toBe(true);
    expect(result.match).toBeDefined();
    expect(result.match?.targetScore).toBeGreaterThan(0.8);
  });
});

describe('applyTextFragments (batch)', () => {
  const sampleContent = `Line 1
Line 2
Line 3
Line 4`;

  it('should apply multiple fragments in order', () => {
    const fragments: TextFragment[] = [
      {
        id: 'fragment-1',
        sectionId: 'section-1',
        content: 'Modified line 1',
        position: 0,
        metadata: {
          contextBefore: [],
          target: 'Line 1',
          contextAfter: ['Line 2'],
        },
      } as TextFragment,
      {
        id: 'fragment-2',
        sectionId: 'section-1',
        content: 'Modified line 3',
        position: 2,
        metadata: {
          contextBefore: ['Line 2'],
          target: 'Line 3',
          contextAfter: ['Line 4'],
        },
      } as TextFragment,
    ];

    const result = applyTextFragments(sampleContent, fragments);

    expect(result.applied).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.content).toContain('Modified line 1');
    expect(result.content).toContain('Modified line 3');
    expect(result.content).toContain('Line 2'); // Unchanged
    expect(result.content).toContain('Line 4'); // Unchanged
  });

  it('should continue on partial failure', () => {
    const fragments: TextFragment[] = [
      {
        id: 'fragment-1',
        sectionId: 'section-1',
        content: 'Modified line 1',
        position: 0,
        metadata: {
          contextBefore: [],
          target: 'Line 1',
          contextAfter: ['Line 2'],
        },
      } as TextFragment,
      {
        id: 'fragment-2',
        sectionId: 'section-1',
        content: 'Should fail',
        position: 1,
        metadata: {
          contextBefore: ['Wrong context'],
          target: 'Nonexistent',
          contextAfter: [],
        },
      } as TextFragment,
      {
        id: 'fragment-3',
        sectionId: 'section-1',
        content: 'Modified line 3',
        position: 2,
        metadata: {
          contextBefore: ['Line 2'],
          target: 'Line 3',
          contextAfter: [],
        },
      } as TextFragment,
    ];

    const result = applyTextFragments(sampleContent, fragments);

    expect(result.applied).toBe(2); // fragment-1 and fragment-3
    expect(result.failed).toBe(1); // fragment-2
    expect(result.content).toContain('Modified line 1');
    expect(result.content).toContain('Modified line 3');
  });

  it('should sort fragments by position', () => {
    const fragments: TextFragment[] = [
      {
        id: 'fragment-2',
        sectionId: 'section-1',
        content: 'Modified line 3',
        position: 2,
        metadata: {
          contextBefore: ['Line 2'],
          target: 'Line 3',
          contextAfter: [],
        },
      } as TextFragment,
      {
        id: 'fragment-1',
        sectionId: 'section-1',
        content: 'Modified line 1',
        position: 0,
        metadata: {
          contextBefore: [],
          target: 'Line 1',
          contextAfter: [],
        },
      } as TextFragment,
    ];

    const result = applyTextFragments(sampleContent, fragments);

    expect(result.applied).toBe(2);
    // Should apply in correct order despite unsorted input
  });

  it('should handle empty fragments array', () => {
    const result = applyTextFragments(sampleContent, []);

    expect(result.applied).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.content).toBe(sampleContent); // Unchanged
  });
});

describe('extractContext', () => {
  const content = `Line 0
Line 1
Line 2
Line 3
Line 4`;

  it('should extract context around middle line', () => {
    const context = extractContext(content, 2, 1);

    expect(context).not.toBeNull();
    expect(context!.contextBefore).toEqual(['Line 1']);
    expect(context!.target).toBe('Line 2');
    expect(context!.contextAfter).toEqual(['Line 3']);
  });

  it('should extract context at start of content', () => {
    const context = extractContext(content, 0, 1);

    expect(context).not.toBeNull();
    expect(context!.contextBefore).toEqual([]);
    expect(context!.target).toBe('Line 0');
    expect(context!.contextAfter).toEqual(['Line 1']);
  });

  it('should extract context at end of content', () => {
    const context = extractContext(content, 4, 1);

    expect(context).not.toBeNull();
    expect(context!.contextBefore).toEqual(['Line 3']);
    expect(context!.target).toBe('Line 4');
    expect(context!.contextAfter).toEqual([]);
  });

  it('should handle contextSize > 1', () => {
    const context = extractContext(content, 2, 2);

    expect(context).not.toBeNull();
    expect(context!.contextBefore).toEqual(['Line 0', 'Line 1']);
    expect(context!.target).toBe('Line 2');
    expect(context!.contextAfter).toEqual(['Line 3', 'Line 4']);
  });

  it('should return null for invalid line index', () => {
    expect(extractContext(content, -1, 1)).toBeNull();
    expect(extractContext(content, 100, 1)).toBeNull();
  });
});

describe('createTextFragmentWithContext', () => {
  const content = `Line 0
Line 1
Line 2`;

  it('should create fragment with valid context', () => {
    const fragment = createTextFragmentWithContext('section-1', content, 1, 'New line 1', 1);

    expect(fragment).not.toBeNull();
    expect(fragment!.sectionId).toBe('section-1');
    expect(fragment!.content).toBe('New line 1');
    expect(fragment!.position).toBe(1);
    expect((fragment as any).metadata.contextBefore).toEqual(['Line 0']);
    expect((fragment as any).metadata.target).toBe('Line 1');
    expect((fragment as any).metadata.contextAfter).toEqual(['Line 2']);
  });

  it('should generate UUID for fragment', () => {
    const fragment = createTextFragmentWithContext('section-1', content, 0, 'Replacement', 1);

    expect(fragment).not.toBeNull();
    expect(fragment!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('should return null for invalid line index', () => {
    expect(createTextFragmentWithContext('section-1', content, -1, 'Replacement', 1)).toBeNull();
    expect(createTextFragmentWithContext('section-1', content, 100, 'Replacement', 1)).toBeNull();
  });
});

describe('hasValidContext', () => {
  it('should return true for valid context', () => {
    const fragment: TextFragment = {
      id: 'test',
      sectionId: 'section-1',
      content: 'Test',
      position: 0,
      metadata: {
        contextBefore: ['Before'],
        target: 'Target line',
        contextAfter: ['After'],
      },
    } as TextFragment;

    expect(hasValidContext(fragment)).toBe(true);
  });

  it('should return true with empty context arrays', () => {
    const fragment: TextFragment = {
      id: 'test',
      sectionId: 'section-1',
      content: 'Test',
      position: 0,
      metadata: {
        contextBefore: [],
        target: 'Target line',
        contextAfter: [],
      },
    } as TextFragment;

    expect(hasValidContext(fragment)).toBe(true);
  });

  it('should return false when metadata is missing', () => {
    const fragment: TextFragment = {
      id: 'test',
      sectionId: 'section-1',
      content: 'Test',
      position: 0,
    };

    expect(hasValidContext(fragment)).toBe(false);
  });

  it('should return false when target is missing', () => {
    const fragment: TextFragment = {
      id: 'test',
      sectionId: 'section-1',
      content: 'Test',
      position: 0,
      metadata: {
        contextBefore: [],
        contextAfter: [],
      },
    } as TextFragment;

    expect(hasValidContext(fragment)).toBe(false);
  });

  it('should return false when context arrays are not arrays', () => {
    const fragment: TextFragment = {
      id: 'test',
      sectionId: 'section-1',
      content: 'Test',
      position: 0,
      metadata: {
        target: 'Target',
        contextBefore: 'not an array',
        contextAfter: [],
      },
    } as TextFragment;

    expect(hasValidContext(fragment as any)).toBe(false);
  });
});

describe('splitLines and joinLines', () => {
  it('should split and join correctly', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const lines = splitLines(content);

    expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);

    const rejoined = joinLines(lines);
    expect(rejoined).toBe(content);
  });

  it('should preserve empty lines', () => {
    const content = 'Line 1\n\nLine 3';
    const lines = splitLines(content);

    expect(lines).toEqual(['Line 1', '', 'Line 3']);

    const rejoined = joinLines(lines);
    expect(rejoined).toBe(content);
  });
});

describe('edge cases', () => {
  it('should handle markdown code blocks', () => {
    const content = `Code:

\`\`\`typescript
const x = 1;
\`\`\`

Text after`;

    const fragment: TextFragment = {
      id: 'test',
      sectionId: 'section-1',
      content: 'const x = 2;',
      position: 1,
      metadata: {
        contextBefore: ['```typescript'],
        target: 'const x = 1;',
        contextAfter: ['```'],
      },
    } as TextFragment;

    const result = applyTextFragment(content, fragment);

    expect(result.applied).toBe(true);
    expect(result.content).toContain('const x = 2;');
  });

  it('should handle unicode characters', () => {
    const content = `Début
Texte français avec émojis 🎉
Fin`;

    const fragment: TextFragment = {
      id: 'test',
      sectionId: 'section-1',
      content: 'Nouveau texte avec accents été 🚀',
      position: 1,
      metadata: {
        contextBefore: ['Début'],
        target: 'Texte français avec émojis 🎉',
        contextAfter: ['Fin'],
      },
    } as TextFragment;

    const result = applyTextFragment(content, fragment);

    expect(result.applied).toBe(true);
    expect(result.content).toContain('Nouveau texte avec accents été 🚀');
  });

  it('should handle special markdown characters', () => {
    const content = `Header
**Bold text** with *italic*
End`;

    const fragment: TextFragment = {
      id: 'test',
      sectionId: 'section-1',
      content: '***Bold italic*** text',
      position: 1,
      metadata: {
        contextBefore: ['Header'],
        target: '**Bold text** with *italic*',
        contextAfter: ['End'],
      },
    } as TextFragment;

    const result = applyTextFragment(content, fragment);

    expect(result.applied).toBe(true);
    expect(result.content).toContain('***Bold italic*** text');
  });
});
