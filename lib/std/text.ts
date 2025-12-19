/**
 * Text manipulation tools
 *
 * Inspired by:
 * - TextToolkit MCP: https://github.com/Cicatriiz/text-toolkit
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 *
 * @module lib/std/text
 */

import * as changeCase from "change-case";
import type { MiniTool } from "./types.ts";

export const textTools: MiniTool[] = [
  {
    name: "text_split",
    description: "Split a string by delimiter into an array",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to split" },
        delimiter: { type: "string", description: "Delimiter (default: ',')" },
      },
      required: ["text"],
    },
    handler: ({ text, delimiter = "," }) => (text as string).split(delimiter as string),
  },
  {
    name: "text_join",
    description: "Join an array of strings with a delimiter",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" }, description: "Items to join" },
        delimiter: { type: "string", description: "Delimiter (default: ',')" },
      },
      required: ["items"],
    },
    handler: ({ items, delimiter = "," }) => (items as string[]).join(delimiter as string),
  },
  {
    name: "text_template",
    description: "Replace {{placeholders}} in a template string",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string", description: "Template with {{placeholders}}" },
        values: { type: "object", description: "Key-value pairs for replacement" },
      },
      required: ["template", "values"],
    },
    handler: ({ template, values }) => {
      let result = template as string;
      for (const [key, value] of Object.entries(values as Record<string, string>)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }
      return result;
    },
  },
  {
    name: "text_case",
    description:
      "Convert text case (upper, lower, title, camel, snake, kebab, pascal, constant, dot, path, sentence)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert" },
        case: {
          type: "string",
          enum: [
            "upper",
            "lower",
            "title",
            "camel",
            "snake",
            "kebab",
            "pascal",
            "constant",
            "dot",
            "path",
            "sentence",
          ],
          description: "Target case",
        },
      },
      required: ["text", "case"],
    },
    handler: ({ text, case: targetCase }) => {
      const s = text as string;
      switch (targetCase) {
        case "upper":
          return s.toUpperCase();
        case "lower":
          return s.toLowerCase();
        case "title":
          return changeCase.capitalCase(s);
        case "camel":
          return changeCase.camelCase(s);
        case "snake":
          return changeCase.snakeCase(s);
        case "kebab":
          return changeCase.kebabCase(s);
        case "pascal":
          return changeCase.pascalCase(s);
        case "constant":
          return changeCase.constantCase(s);
        case "dot":
          return changeCase.dotCase(s);
        case "path":
          return changeCase.pathCase(s);
        case "sentence":
          return changeCase.sentenceCase(s);
        default:
          return s;
      }
    },
  },
  {
    name: "text_regex",
    description: "Match or replace using regular expression",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        pattern: { type: "string", description: "Regex pattern" },
        replacement: { type: "string", description: "Replacement (if replacing)" },
        flags: { type: "string", description: "Regex flags (default: 'g')" },
      },
      required: ["text", "pattern"],
    },
    handler: ({ text, pattern, replacement, flags = "g" }) => {
      const regex = new RegExp(pattern as string, flags as string);
      if (replacement !== undefined) {
        return (text as string).replace(regex, replacement as string);
      }
      return (text as string).match(regex) || [];
    },
  },
  {
    name: "text_trim",
    description: "Trim whitespace from text (start, end, or both)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to trim" },
        side: { type: "string", enum: ["both", "start", "end"], description: "Side to trim" },
      },
      required: ["text"],
    },
    handler: ({ text, side = "both" }) => {
      const s = text as string;
      switch (side) {
        case "start":
          return s.trimStart();
        case "end":
          return s.trimEnd();
        default:
          return s.trim();
      }
    },
  },
  {
    name: "text_count",
    description: "Count words, characters, or lines in text",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        unit: { type: "string", enum: ["words", "chars", "lines"], description: "What to count" },
      },
      required: ["text"],
    },
    handler: ({ text, unit = "words" }) => {
      const s = text as string;
      switch (unit) {
        case "chars":
          return s.length;
        case "lines":
          return s.split("\n").length;
        default:
          return s.trim().split(/\s+/).filter(Boolean).length;
      }
    },
  },
  {
    name: "text_pad",
    description: "Pad text to a specified length",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to pad" },
        length: { type: "number", description: "Target length" },
        char: { type: "string", description: "Padding character (default: ' ')" },
        side: { type: "string", enum: ["start", "end", "both"], description: "Side to pad" },
      },
      required: ["text", "length"],
    },
    handler: ({ text, length, char = " ", side = "end" }) => {
      const s = text as string;
      const len = length as number;
      const c = (char as string)[0] || " ";
      switch (side) {
        case "start":
          return s.padStart(len, c);
        case "both": {
          const totalPad = len - s.length;
          const padStart = Math.floor(totalPad / 2);
          return s.padStart(s.length + padStart, c).padEnd(len, c);
        }
        default:
          return s.padEnd(len, c);
      }
    },
  },
  // Inspired by TextToolkit MCP: https://github.com/Cicatriiz/text-toolkit
  {
    name: "text_regex_test",
    description: "Test if a regex pattern matches the text (returns boolean)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        pattern: { type: "string", description: "Regex pattern" },
        flags: { type: "string", description: "Regex flags (default: '')" },
      },
      required: ["text", "pattern"],
    },
    handler: ({ text, pattern, flags = "" }) => {
      const regex = new RegExp(pattern as string, flags as string);
      return regex.test(text as string);
    },
  },
  {
    name: "text_regex_extract",
    description: "Extract all matches with capture groups from text",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        pattern: { type: "string", description: "Regex pattern with groups" },
        flags: { type: "string", description: "Regex flags (default: 'g')" },
      },
      required: ["text", "pattern"],
    },
    handler: ({ text, pattern, flags = "g" }) => {
      const regex = new RegExp(pattern as string, flags as string);
      const matches: Array<{ match: string; groups: string[]; index: number }> = [];
      let match;
      while ((match = regex.exec(text as string)) !== null) {
        matches.push({
          match: match[0],
          groups: match.slice(1),
          index: match.index,
        });
        if (!regex.global) break;
      }
      return matches;
    },
  },
  {
    name: "text_regex_split",
    description: "Split text by regex pattern",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        pattern: { type: "string", description: "Regex pattern to split by" },
        limit: { type: "number", description: "Max number of splits" },
      },
      required: ["text", "pattern"],
    },
    handler: ({ text, pattern, limit }) => {
      const regex = new RegExp(pattern as string);
      return (text as string).split(regex, limit as number | undefined);
    },
  },
  {
    name: "text_lorem",
    description: "Generate lorem ipsum placeholder text",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of units (default: 1)" },
        unit: {
          type: "string",
          enum: ["words", "sentences", "paragraphs"],
          description: "Unit type (default: paragraphs)",
        },
      },
    },
    handler: ({ count = 1, unit = "paragraphs" }) => {
      const words = [
        "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
        "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
        "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
        "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
        "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
        "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
        "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
        "deserunt", "mollit", "anim", "id", "est", "laborum",
      ];

      const randomWord = () => words[Math.floor(Math.random() * words.length)];
      const randomSentence = () => {
        const len = 8 + Math.floor(Math.random() * 12);
        const sentence = Array.from({ length: len }, randomWord).join(" ");
        return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
      };
      const randomParagraph = () => {
        const len = 3 + Math.floor(Math.random() * 5);
        return Array.from({ length: len }, randomSentence).join(" ");
      };

      const cnt = count as number;
      switch (unit) {
        case "words":
          return Array.from({ length: cnt }, randomWord).join(" ");
        case "sentences":
          return Array.from({ length: cnt }, randomSentence).join(" ");
        default:
          return Array.from({ length: cnt }, randomParagraph).join("\n\n");
      }
    },
  },
  {
    name: "text_slugify",
    description: "Convert text to URL-friendly slug (lowercase, hyphens, no special chars)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to slugify" },
        separator: { type: "string", description: "Word separator (default: '-')" },
        lowercase: { type: "boolean", description: "Convert to lowercase (default: true)" },
      },
      required: ["text"],
    },
    handler: ({ text, separator = "-", lowercase = true }) => {
      let slug = (text as string)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-zA-Z0-9\s-]/g, "") // Remove special chars
        .trim()
        .replace(/\s+/g, separator as string) // Replace spaces
        .replace(new RegExp(`${separator}+`, "g"), separator as string); // Remove duplicate separators

      if (lowercase) slug = slug.toLowerCase();
      return slug;
    },
  },
  {
    name: "text_nato",
    description: "Convert text to NATO phonetic alphabet",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert" },
        separator: { type: "string", description: "Word separator (default: ' ')" },
      },
      required: ["text"],
    },
    handler: ({ text, separator = " " }) => {
      const nato: Record<string, string> = {
        A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo",
        F: "Foxtrot", G: "Golf", H: "Hotel", I: "India", J: "Juliet",
        K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar",
        P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango",
        U: "Uniform", V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee",
        Z: "Zulu", "0": "Zero", "1": "One", "2": "Two", "3": "Three",
        "4": "Four", "5": "Five", "6": "Six", "7": "Seven", "8": "Eight",
        "9": "Nine",
      };
      return (text as string)
        .toUpperCase()
        .split("")
        .map((c) => nato[c] || c)
        .join(separator as string);
    },
  },
  {
    name: "text_diff",
    description: "Compare two texts and show differences",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text1: { type: "string", description: "First text" },
        text2: { type: "string", description: "Second text" },
        mode: {
          type: "string",
          enum: ["lines", "words", "chars"],
          description: "Comparison mode (default: lines)",
        },
      },
      required: ["text1", "text2"],
    },
    handler: ({ text1, text2, mode = "lines" }) => {
      const t1 = text1 as string;
      const t2 = text2 as string;

      // Split based on mode
      let units1: string[], units2: string[];
      switch (mode) {
        case "chars":
          units1 = t1.split("");
          units2 = t2.split("");
          break;
        case "words":
          units1 = t1.split(/\s+/);
          units2 = t2.split(/\s+/);
          break;
        default: // lines
          units1 = t1.split("\n");
          units2 = t2.split("\n");
      }

      // Simple LCS-based diff
      const lcs = (a: string[], b: string[]): string[] => {
        const m = a.length, n = b.length;
        const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
          for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
              dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
              dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
          }
        }

        // Backtrack to find LCS
        const result: string[] = [];
        let i = m, j = n;
        while (i > 0 && j > 0) {
          if (a[i - 1] === b[j - 1]) {
            result.unshift(a[i - 1]);
            i--; j--;
          } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
          } else {
            j--;
          }
        }
        return result;
      };

      const common = new Set(lcs(units1, units2));
      const removed = units1.filter((u) => !units2.includes(u) || units1.indexOf(u) !== units2.indexOf(u));
      const added = units2.filter((u) => !units1.includes(u) || units1.indexOf(u) !== units2.indexOf(u));

      return {
        identical: t1 === t2,
        commonCount: common.size,
        removedCount: removed.length,
        addedCount: added.length,
        removed: removed.slice(0, 50), // Limit output
        added: added.slice(0, 50),
        similarity: units1.length === 0 && units2.length === 0
          ? 100
          : Math.round((common.size / Math.max(units1.length, units2.length)) * 100),
      };
    },
  },
  {
    name: "text_stats",
    description: "Analyze text and return statistics",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
      },
      required: ["text"],
    },
    handler: ({ text }) => {
      const t = text as string;
      const words = t.trim().split(/\s+/).filter(Boolean);
      const sentences = t.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      const paragraphs = t.split(/\n\n+/).filter((p) => p.trim().length > 0);
      const lines = t.split("\n");

      // Character counts
      const chars = t.length;
      const charsNoSpaces = t.replace(/\s/g, "").length;
      const letters = (t.match(/[a-zA-Z]/g) || []).length;
      const digits = (t.match(/\d/g) || []).length;

      // Word frequency
      const wordFreq: Record<string, number> = {};
      for (const word of words) {
        const normalized = word.toLowerCase().replace(/[^a-z]/g, "");
        if (normalized) {
          wordFreq[normalized] = (wordFreq[normalized] || 0) + 1;
        }
      }
      const topWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));

      // Readability metrics
      const avgWordLength = words.length > 0
        ? words.reduce((sum, w) => sum + w.length, 0) / words.length
        : 0;
      const avgSentenceLength = sentences.length > 0
        ? words.length / sentences.length
        : 0;

      // Flesch-Kincaid approximation (simplified)
      const syllableCount = (word: string) => {
        const w = word.toLowerCase().replace(/[^a-z]/g, "");
        if (w.length <= 3) return 1;
        return w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
          .replace(/^y/, "")
          .match(/[aeiouy]{1,2}/g)?.length || 1;
      };
      const totalSyllables = words.reduce((sum, w) => sum + syllableCount(w), 0);
      const fleschKincaid = words.length > 0 && sentences.length > 0
        ? 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (totalSyllables / words.length)
        : 0;

      return {
        characters: chars,
        charactersNoSpaces: charsNoSpaces,
        letters,
        digits,
        words: words.length,
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        lines: lines.length,
        avgWordLength: Math.round(avgWordLength * 10) / 10,
        avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
        readabilityScore: Math.round(Math.max(0, Math.min(100, fleschKincaid))),
        topWords,
        uniqueWords: Object.keys(wordFreq).length,
      };
    },
  },
];
