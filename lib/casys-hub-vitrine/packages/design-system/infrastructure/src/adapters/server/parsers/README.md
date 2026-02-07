# 📄 Parser MDX - Architecture et Migration

## 🏗️ Architecture Actuelle

### Parser Custom (`MdxParserService`)

Le parser actuel utilise une approche **regex-based** pour extraire la structure des articles MDX :

```typescript
interface MdxParserInterface {
  parseArticleStructure(filePath: string, tenantId?: string, projectId?: string): Promise<ArticleStructure>
}
```

**Fonctionnalités supportées :**
- ✅ Parsing frontmatter (gray-matter)
- ✅ Hiérarchie des sections H1→H6 avec parenté
- ✅ Détection composants Astro (`<Hero>`, `<CommentedText>`, etc.)
- ✅ Extraction props JSX complexes
- ✅ Support multi-ligne pour `<CommentedText>`
- ✅ Gestion tenant/project depuis le chemin

**Limitations :**
- ⚠️ Parsing basique (regex vs AST)
- ⚠️ Fragile sur MDX complexe
- ⚠️ Pas de support imports/exports
- ⚠️ Expressions JSX limitées

## 🚀 Migration Proposée : Astro + Unist

### Stack Technique

```json
{
  "dependencies": {
    "unified": "^11.0.4",
    "remark-parse": "^11.0.0", 
    "remark-mdx": "^3.0.0",
    "remark-frontmatter": "^5.0.0",
    "mdast-util-from-markdown": "^2.0.0",
    "mdast-util-mdx": "^3.0.0",
    "unist-util-visit": "^5.0.0",
    "unist-util-select": "^5.0.0"
  }
}
```

### Architecture Proposée

```typescript
// Interface commune (pas de breaking change)
interface MdxParserInterface {
  parseArticleStructure(filePath: string, tenantId?: string, projectId?: string): Promise<ArticleStructure>
}

// Implémentation Unist
class UnistMdxParser implements MdxParserInterface {
  private processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkFrontmatter)
  
  async parseArticleStructure(filePath: string, tenantId?: string, projectId?: string): Promise<ArticleStructure> {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const tree = this.processor.parse(fileContent)
    
    return this.transformAstToArticleStructure(tree, filePath, tenantId, projectId)
  }
  
  private transformAstToArticleStructure(ast: Root, filePath: string, tenantId?: string, projectId?: string): ArticleStructure {
    // Transformation AST → ArticleStructure
    // Utilisation de visit() pour parcourir l'arbre
  }
}
```

## 📋 Plan de Migration

### Phase 1 : Préparation (1-2 jours)
- [ ] Installer les dépendances Unist
- [ ] Créer `UnistMdxParser` avec interface commune
- [ ] Implémenter la transformation AST → `ArticleStructure`
- [ ] Tests unitaires sur les mêmes fixtures

### Phase 2 : Implémentation (2-3 jours)
- [ ] Visitor pour sections (headings)
- [ ] Visitor pour composants JSX
- [ ] Visitor pour `CommentedText` multi-ligne
- [ ] Extraction props JSX robuste
- [ ] Gestion frontmatter et métadonnées

### Phase 3 : Migration (1 jour)
- [ ] Switch dans `infrastructure.container.ts`
- [ ] Tests d'intégration
- [ ] Validation sur articles existants
- [ ] Rollback plan si problème

### Phase 4 : Nettoyage (optionnel)
- [ ] Suppression ancien parser
- [ ] Documentation mise à jour
- [ ] Optimisations performances

## 🔧 Exemple d'Implémentation

```typescript
class UnistMdxParser implements MdxParserInterface {
  async parseArticleStructure(filePath: string, tenantId?: string, projectId?: string): Promise<ArticleStructure> {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    
    // Parse avec Unist
    const tree = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkFrontmatter)
      .parse(fileContent)
    
    // Extraction frontmatter
    const { data: frontmatter, content } = matter(fileContent)
    
    // Transformation AST
    const sections: SectionNode[] = []
    const componentUsages: ComponentUsage[] = []
    const textFragments: TextFragment[] = []
    const comments: ArticleComment[] = []
    
    // Visitor pour les headings
    visit(tree, 'heading', (node, index, parent) => {
      const section: SectionNode = {
        id: uuidv4(),
        articleId,
        title: this.extractTextFromNode(node),
        level: node.depth,
        position: index || 0,
        parentSectionId: this.findParentSection(sections, node.depth),
        content: ''
      }
      sections.push(section)
    })
    
    // Visitor pour les composants JSX
    visit(tree, 'mdxJsxFlowElement', (node) => {
      if (node.name && /^[A-Z]/.test(node.name)) {
        const componentUsage: ComponentUsage = {
          id: uuidv4(),
          componentId: node.name,
          sectionId: this.getCurrentSectionId(sections),
          props: this.extractPropsFromAttributes(node.attributes),
          position: node.position?.start.line || 0
        }
        componentUsages.push(componentUsage)
      }
    })
    
    return {
      article: this.createArticleNode(frontmatter, filePath, tenantId, projectId),
      sections,
      componentUsages,
      textFragments,
      comments
    }
  }
}
```

## 🎯 Avantages de la Migration

### Robustesse
- **AST complet** : Parsing fiable vs regex fragile
- **Gestion des cas edge** : Expressions JSX complexes, imbrication
- **Support natif MDX** : Imports, exports, expressions

### Maintenabilité
- **Écosystème standard** : Plugins communautaire
- **Compatibilité Astro** : Même stack que le framework
- **Tests robustes** : AST plus facile à tester

### Extensibilité
- **Plugins** : Syntax highlighting, math, etc.
- **Transformations** : Optimisations, validations
- **Formats** : Support d'autres formats (Markdown pur, etc.)

## 🚨 Risques et Mitigation

### Risques
- **Breaking changes** : Parsing différent
- **Performance** : AST plus lourd que regex
- **Complexité** : Courbe d'apprentissage

### Mitigation
- **Interface commune** : Migration transparente
- **Tests exhaustifs** : Validation sur tous les articles
- **Rollback plan** : Retour rapide si problème
- **Migration progressive** : Feature flag possible

## 🔄 Stratégie de Déploiement

```typescript
// Feature flag pour migration progressive
class MdxParserFactory {
  static create(useUnist = false): MdxParserInterface {
    return useUnist 
      ? new UnistMdxParser()
      : new MdxParserService() // Parser actuel
  }
}

// Dans infrastructure.container.ts
const parser = MdxParserFactory.create(config.useUnistParser)
```

## 📊 Critères de Décision

**Migrer MAINTENANT si :**
- ✅ Parser actuel casse sur certains articles
- ✅ Besoin d'expressions JSX complexes
- ✅ Temps disponible pour la migration
- ✅ Volonté d'aligner sur les standards

**Reporter si :**
- ❌ Parser actuel fonctionne parfaitement
- ❌ Pas de cas complexes identifiés
- ❌ Autres priorités critiques
- ❌ Équipe pas familière avec AST

## 🏁 Conclusion

La migration vers Unist est **recommandée à moyen terme** pour la robustesse et l'extensibilité. L'architecture actuelle avec l'interface `MdxParserInterface` permet une migration **transparente et sans risque**.

**Prochaine étape :** Valider avec l'équipe et planifier la migration selon les priorités projet.
