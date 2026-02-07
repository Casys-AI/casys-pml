#!/usr/bin/env node
/**
 * Script de validation automatique des requêtes Kuzu
 * Extrait et valide toutes les requêtes Cypher du codebase
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import Database from 'kuzu';
import { tmpdir } from 'os';

interface ExtractedQuery {
  file: string;
  method: string;
  query: string;
  lineNumber: number;
}

class KuzuQueryExtractor {
  private queries: ExtractedQuery[] = [];

  /**
   * Extrait toutes les requêtes Cypher des fichiers TypeScript
   */
  extractQueriesFromDirectory(dir: string): ExtractedQuery[] {
    this.queries = [];
    this.scanDirectory(dir);
    return this.queries;
  }

  private scanDirectory(dir: string): void {
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        this.scanDirectory(fullPath);
      } else if (stat.isFile() && extname(item) === '.ts') {
        this.extractQueriesFromFile(fullPath);
      }
    }
  }

  private extractQueriesFromFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      let inQuery = false;
      let currentQuery = '';
      let queryStartLine = 0;
      let currentMethod = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Détecter le début d'une méthode
        if (trimmed.includes('async ') && trimmed.includes('(')) {
          const methodMatch = trimmed.match(/async\s+(\w+)\s*\(/);
          if (methodMatch) {
            currentMethod = methodMatch[1];
          }
        }

        // Détecter le début d'une requête Cypher
        if (trimmed.includes('const query = `') || trimmed.includes('const query=`')) {
          inQuery = true;
          queryStartLine = i + 1;
          currentQuery = '';
          continue;
        }

        // Construire la requête
        if (inQuery) {
          if (trimmed.includes('`;')) {
            // Fin de la requête
            inQuery = false;

            if (currentQuery.trim()) {
              this.queries.push({
                file: filePath,
                method: currentMethod,
                query: currentQuery.trim(),
                lineNumber: queryStartLine,
              });
            }
          } else {
            // Continuer à construire la requête
            currentQuery += line + '\n';
          }
        }
      }
    } catch (error) {
      console.error(`Erreur lors de la lecture de ${filePath}:`, error);
    }
  }
}

class KuzuQueryValidator {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  async initializeSchema(): Promise<void> {
    const schemaTables = [
      `CREATE NODE TABLE IF NOT EXISTS Tenant(
        id STRING PRIMARY KEY,
        name STRING,
        created_at TIMESTAMP,
        config JSON
      )`,

      `CREATE NODE TABLE IF NOT EXISTS Project(
        id STRING PRIMARY KEY,
        name STRING,
        description STRING,
        tenant_id STRING,
        created_at TIMESTAMP
      )`,

      `CREATE NODE TABLE IF NOT EXISTS Article(
        id STRING PRIMARY KEY,
        title STRING,
        description STRING,
        language STRING,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        keywords STRING[],
        sources STRING[],
        agents STRING[],
        tenant_id STRING,
        project_id STRING,
        content STRING,
        status STRING,
        embedding FLOAT[],
        embedding_text STRING
      )`,

      `CREATE NODE TABLE IF NOT EXISTS Section(
        id STRING PRIMARY KEY,
        title STRING,
        content STRING,
        level INT64,
        order_index INT64,
        article_id STRING,
        parent_section_id STRING,
        embedding FLOAT[],
        embedding_text STRING
      )`,

      `CREATE NODE TABLE IF NOT EXISTS Component(
        id STRING PRIMARY KEY,
        name STRING,
        type STRING,
        description STRING,
        embedding FLOAT[],
        embedding_text STRING
      )`,
    ];

    for (const tableQuery of schemaTables) {
      try {
        await this.db.query(tableQuery);
      } catch (error) {
        console.warn(`Schema initialization warning: ${error}`);
      }
    }
  }

  async validateQuery(query: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      // Utiliser EXPLAIN pour valider la syntaxe sans exécuter
      const explainQuery = `EXPLAIN ${query}`;
      await this.db.query(explainQuery);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async generateReport(queries: ExtractedQuery[]): Promise<void> {
    console.log('\n📊 Rapport de Validation des Requêtes Kuzu\n');
    console.log('='.repeat(60));

    let validCount = 0;
    let invalidCount = 0;
    const patterns = new Map<string, number>();

    for (const extractedQuery of queries) {
      const { file, method, query, lineNumber } = extractedQuery;
      const validation = await this.validateQuery(query);

      if (validation.isValid) {
        validCount++;
        console.log(`✅ ${file}:${lineNumber} (${method})`);
      } else {
        invalidCount++;
        console.log(`❌ ${file}:${lineNumber} (${method})`);
        console.log(`   Erreur: ${validation.error}`);
        console.log(`   Requête: ${query.substring(0, 100)}...`);
      }

      // Analyser les patterns
      this.analyzeQueryPatterns(query, patterns);
    }

    console.log('\n📈 Statistiques:');
    console.log(`   Requêtes valides: ${validCount}`);
    console.log(`   Requêtes invalides: ${invalidCount}`);
    console.log(`   Total: ${queries.length}`);

    console.log('\n🔍 Patterns Cypher Détectés:');
    for (const [pattern, count] of patterns.entries()) {
      console.log(`   ${pattern}: ${count}`);
    }
  }

  private analyzeQueryPatterns(query: string, patterns: Map<string, number>): void {
    const checks = [
      { pattern: 'MERGE avec ON MATCH', regex: /MERGE.*ON\s+MATCH/s },
      { pattern: 'MERGE avec ON CREATE', regex: /MERGE.*ON\s+CREATE/s },
      { pattern: 'SET multiple propriétés', regex: /SET.*,.*=/s },
      { pattern: 'CREATE NODE TABLE', regex: /CREATE\s+NODE\s+TABLE/i },
      { pattern: 'MATCH patterns', regex: /MATCH\s*\(/i },
      { pattern: 'Timestamp functions', regex: /timestamp\s*\(/i },
      { pattern: 'Parameter usage', regex: /\$\w+/g },
      { pattern: 'Array types', regex: /\w+\[\]/g },
    ];

    checks.forEach(({ pattern, regex }) => {
      if (regex.test(query)) {
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    });
  }
}

// Script principal
async function main() {
  const extractor = new KuzuQueryExtractor();
  const infraDir = join(process.cwd(), 'src', 'persistence', 'graph');

  console.log(`🔍 Extraction des requêtes depuis: ${infraDir}`);
  const queries = extractor.extractQueriesFromDirectory(infraDir);

  console.log(`📝 ${queries.length} requêtes trouvées`);

  // Créer une DB temporaire pour la validation
  const testDbPath = join(tmpdir(), `kuzu-validation-${Date.now()}`);
  const validator = new KuzuQueryValidator(testDbPath);

  try {
    await validator.initializeSchema();
    await validator.generateReport(queries);
  } catch (error) {
    console.error('❌ Erreur lors de la validation:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { KuzuQueryExtractor, KuzuQueryValidator };
