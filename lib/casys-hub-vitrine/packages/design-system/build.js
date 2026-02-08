#!/usr/bin/env node
import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🎨 Building Material 3 Expressive Design System...\n');

// Load all token files
async function loadTokens() {
  const tokenFiles = await glob('tokens/**/*.json', {
    cwd: __dirname,
    ignore: ['**/components/**', '**/themes/**'],
  });
  const tokens = {};

  for (const file of tokenFiles) {
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf-8'));
    Object.assign(tokens, content);
  }

  return tokens;
}

// Load theme files
async function loadThemes() {
  const lightTheme = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'tokens/themes/light.json'), 'utf-8')
  );
  const darkTheme = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'tokens/themes/dark.json'), 'utf-8')
  );
  return { light: lightTheme, dark: darkTheme };
}

// Load component tokens
async function loadComponentTokens() {
  const componentFiles = await glob('tokens/components/*.json', { cwd: __dirname });
  const components = {};

  for (const file of componentFiles) {
    const componentName = path.basename(file, '.json');
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf-8'));
    components[componentName] = content;
  }

  return components;
}

// Resolve token references like {md.ref.palette.primary40}
function resolveReferences(tokens, maxDepth = 10) {
  const resolved = {};

  function resolve(key, depth = 0) {
    if (depth > maxDepth) {
      console.warn(`⚠️  Max depth reached for ${key}`);
      return null;
    }

    const token = tokens[key];
    if (!token) return null;

    const value = token.value;

    // If value is a string reference
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const refKey = value.slice(1, -1);
      return resolve(refKey, depth + 1);
    }

    // If value is an object (like shape tokens)
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }

    return value;
  }

  for (const key in tokens) {
    const resolvedValue = resolve(key);
    if (resolvedValue !== null) {
      resolved[key] = {
        ...tokens[key],
        value: resolvedValue,
      };
    }
  }

  return resolved;
}

// Convert dot notation to CSS variable name
function toCssVar(key) {
  return `--${key.replace(/\./g, '-')}`;
}

// Convert dot notation to SCSS variable name
function toScssVar(key) {
  return `$${key.replace(/\./g, '-')}`;
}

// Generate CSS custom properties
function generateCSS(tokens, themes) {
  let css = '/* Material 3 Expressive Design Tokens */\n\n';

  // Root variables (from base tokens)
  css += ':root {\n';
  for (const [key, token] of Object.entries(tokens)) {
    if (typeof token.value === 'string' || typeof token.value === 'number') {
      css += `  ${toCssVar(key)}: ${token.value};\n`;
    }
  }
  css += '}\n\n';

  // Light theme
  css += ':root,\n[data-theme="light"] {\n';
  for (const [key, token] of Object.entries(themes.light)) {
    if (typeof token.value === 'string' || typeof token.value === 'number') {
      css += `  ${toCssVar(key)}: ${token.value};\n`;
    }
  }
  css += '}\n\n';

  // Dark theme
  css += '[data-theme="dark"] {\n';
  for (const [key, token] of Object.entries(themes.dark)) {
    if (typeof token.value === 'string' || typeof token.value === 'number') {
      css += `  ${toCssVar(key)}: ${token.value};\n`;
    }
  }
  css += '}\n';

  return css;
}

// Generate SCSS variables
function generateSCSS(tokens, themes) {
  let scss = '// Material 3 Expressive Design Tokens\n\n';

  // Base tokens
  scss += '// Base tokens\n';
  for (const [key, token] of Object.entries(tokens)) {
    if (typeof token.value === 'string' || typeof token.value === 'number') {
      scss += `${toScssVar(key)}: ${token.value};\n`;
    }
  }
  scss += '\n';

  // Light theme
  scss += '// Light theme\n';
  for (const [key, token] of Object.entries(themes.light)) {
    if (typeof token.value === 'string' || typeof token.value === 'number') {
      scss += `${toScssVar(key)}-light: ${token.value};\n`;
    }
  }
  scss += '\n';

  // Dark theme
  scss += '// Dark theme\n';
  for (const [key, token] of Object.entries(themes.dark)) {
    if (typeof token.value === 'string' || typeof token.value === 'number') {
      scss += `${toScssVar(key)}-dark: ${token.value};\n`;
    }
  }

  return scss;
}

// Generate JS module
function generateJS(tokens) {
  let js = '// Material 3 Expressive Design Tokens\n\n';
  js += 'export const tokens = ';

  const tokenMap = {};
  for (const [key, token] of Object.entries(tokens)) {
    tokenMap[key] = token.value;
  }

  js += JSON.stringify(tokenMap, null, 2);
  js += ';\n\nexport default tokens;\n';

  return js;
}

// Generate TypeScript declarations
function generateTS(tokens) {
  let ts = '// Material 3 Expressive Design Tokens\n\n';
  ts += 'export interface DesignTokens {\n';

  for (const key of Object.keys(tokens)) {
    const safeKey = key.includes('.') ? `"${key}"` : key;
    ts += `  ${safeKey}: string | number;\n`;
  }

  ts += '}\n\n';
  ts += 'export const tokens: DesignTokens;\n';
  ts += 'export default tokens;\n';

  return ts;
}

// Generate component CSS from M3 specs
function generateComponentsCSS(components, allTokens) {
  let css = '/* Material 3 Components - Generated from official specs */\n\n';

  // Generate CSS vars for all component tokens
  css += ':root {\n';
  for (const [componentName, tokens] of Object.entries(components)) {
    for (const [key, token] of Object.entries(tokens)) {
      const resolvedValue =
        typeof token.value === 'string' && token.value.startsWith('{')
          ? `var(${toCssVar(token.value.slice(1, -1))})`
          : token.value;

      if (typeof resolvedValue === 'string' || typeof resolvedValue === 'number') {
        css += `  ${toCssVar(key)}: ${resolvedValue};\n`;
      }
    }
  }
  css += '}\n\n';

  // Generate component classes using the tokens
  css += '/* Filled Button - Material 3 Official Specs */\n';
  css += '.btn-filled {\n';
  css += '  display: inline-flex;\n';
  css += '  align-items: center;\n';
  css += '  justify-content: center;\n';
  css += '  gap: 8px;\n';
  css += '  height: var(--md-comp-filled-button-container-height, 40px);\n';
  css += '  padding: 0 24px;\n';
  css += '  font-size: var(--md-comp-filled-button-label-text-size);\n';
  css += '  font-weight: var(--md-comp-filled-button-label-text-weight);\n';
  css += '  line-height: var(--md-comp-filled-button-label-text-line-height);\n';
  css += '  letter-spacing: var(--md-comp-filled-button-label-text-tracking);\n';
  css += '  background: var(--md-sys-color-primary);\n';
  css += '  color: var(--md-sys-color-on-primary);\n';
  css += '  border: none;\n';
  css += '  border-radius: var(--md-comp-filled-button-container-shape);\n';
  css += '  box-shadow: var(--md-comp-filled-button-container-elevation);\n';
  css += '  cursor: pointer;\n';
  css += '  transition: all 250ms var(--md-sys-motion-easing-emphasized);\n';
  css += '}\n\n';

  css += '.btn-filled:hover {\n';
  css += '  box-shadow: var(--md-comp-filled-button-hover-container-elevation);\n';
  css += '}\n\n';

  css += '.btn-filled:disabled {\n';
  css += '  opacity: var(--md-comp-filled-button-disabled-container-opacity, 0.38);\n';
  css += '  cursor: not-allowed;\n';
  css += '}\n\n';

  return css;
}

// Main build function
async function build() {
  try {
    // Load tokens
    console.log('📥 Loading tokens...');
    const rawTokens = await loadTokens();
    const themes = await loadThemes();
    const components = await loadComponentTokens();

    console.log(`✓ Loaded ${Object.keys(rawTokens).length} base tokens`);
    console.log(`✓ Loaded ${Object.keys(components).length} components`);
    console.log(`✓ Loaded light theme (${Object.keys(themes.light).length} tokens)`);
    console.log(`✓ Loaded dark theme (${Object.keys(themes.dark).length} tokens)\n`);

    // Resolve references
    console.log('🔗 Resolving token references...');
    const tokens = resolveReferences(rawTokens);
    const resolvedLight = resolveReferences(themes.light);
    const resolvedDark = resolveReferences(themes.dark);

    // Merge all tokens for component resolution
    const allTokens = { ...tokens, ...resolvedLight };
    console.log(`✓ Resolved ${Object.keys(tokens).length} tokens\n`);

    // Create dist directory
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Generate outputs
    console.log('\n📦 Generating outputs...');

    // Import M3 generated colors
    const TOKENS_DIR = path.join(__dirname, 'tokens');
    const m3ColorsPath = path.join(TOKENS_DIR, 'm3-colors-generated.css');
    const m3ColorsContent = fs.existsSync(m3ColorsPath) 
      ? fs.readFileSync(m3ColorsPath, 'utf-8')
      : '/* M3 colors not generated yet - run: pnpm generate-m3 */';

    // Generate tokens.css with real M3 colors
    const css = generateCSS(tokens, { light: resolvedLight, dark: resolvedDark });
    const tokensCss = `${m3ColorsContent}\n\n${css}`;
    fs.writeFileSync(path.join(distDir, 'tokens.css'), tokensCss);
    console.log('✓ Generated tokens.css (with real M3 colors)');

    const componentsCss = generateComponentsCSS(components, allTokens);
    fs.writeFileSync(path.join(distDir, 'components.css'), componentsCss);
    console.log('✓ Generated components.css (from M3 official specs)');

    // Load and bundle all CSS utilities
    console.log('📦 Bundling CSS utilities...');
    const utilityFiles = [
      'css/utilities/colors.css',
      'css/utilities/typography.css',
      'css/utilities/spacing.css',
      'css/utilities/layout.css',
      'css/utilities/shapes.css',
      'css/utilities/elevation.css',
      'css/utilities/effects.css',
      'css/utilities/animations.css'
    ];

    let utilitiesCss = '/* Material 3 Utilities - Complete Bundle */\n\n';
    for (const file of utilityFiles) {
      const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
      utilitiesCss += content + '\n\n';
    }
    fs.writeFileSync(path.join(distDir, 'utilities.css'), utilitiesCss);
    console.log('✓ Generated utilities.css (bundled from 8 files)');

    // Load base CSS
    const resetCss = fs.readFileSync(path.join(__dirname, 'css/base/reset.css'), 'utf-8');
    
    // Load patterns (auto-discover all pattern CSS files)
    const patternFiles = (await glob('css/patterns/**/*.css', { cwd: __dirname })).sort();
    let patternsCss = '/* Material 3 Patterns - Semantic Reusable Classes */\n\n';
    for (const file of patternFiles) {
      const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
      patternsCss += content + '\n\n';
    }
    fs.writeFileSync(path.join(distDir, 'patterns.css'), patternsCss);
    console.log('✓ Generated patterns.css (semantic reusable patterns)');
    
    // Create m3.css complete bundle (reset FIRST for @import, then tokens WITH brand colors, then rest)
    const m3Bundle = `${resetCss}\n\n${tokensCss}\n\n${componentsCss}\n\n${utilitiesCss}\n\n${patternsCss}`;
    fs.writeFileSync(path.join(distDir, 'm3.css'), m3Bundle);
    console.log('✓ Generated m3.css (complete bundle: reset + tokens + components + utilities + patterns)');

    const scss = generateSCSS(tokens, { light: resolvedLight, dark: resolvedDark });
    fs.writeFileSync(path.join(distDir, 'tokens.scss'), scss);
    console.log('✓ Generated tokens.scss');

    const js = generateJS(tokens);
    fs.writeFileSync(path.join(distDir, 'tokens.js'), js);
    console.log('✓ Generated tokens.js');

    const ts = generateTS(tokens);
    fs.writeFileSync(path.join(distDir, 'tokens.d.ts'), ts);
    console.log('✓ Generated tokens.d.ts');

    console.log('\n✅ Build complete!\n');
    console.log('📦 Generated files:');
    console.log('   - dist/tokens.css      (CSS custom properties + themes)');
    console.log('   - dist/components.css  (M3 official component specs)');
    console.log('   - dist/utilities.css   (Utility classes)');
    console.log('   - dist/m3.css          (Complete bundle)');
    console.log('   - dist/tokens.scss     (SCSS variables)');
    console.log('   - dist/tokens.js       (JavaScript module)');
    console.log('   - dist/tokens.d.ts     (TypeScript types)\n');
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

build();
