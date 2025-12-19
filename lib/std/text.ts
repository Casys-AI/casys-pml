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
];
