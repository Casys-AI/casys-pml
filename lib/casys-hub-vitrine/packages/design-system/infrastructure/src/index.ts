// Export des services et factories
export * from './infrastructure.container';

// Export du loader de configuration
export * from './config/component-catalog.adapter';
export * from './config/config.loader';
export * from './config/fs-prompt-template.adapter';
export * from './config/fs-yaml-user-project-config.adapter';
export * from './config/logging.config';
export * from './config/project-seo-settings.adapter';

// Export des utilitaires
export * from './utils/mdx-utils';

// Export adaptateurs de persistence graph (Neo4j)
export * from './adapters/server/persistence/graph/neo4j/neo4j-connection';
export * from './adapters/server/persistence/graph/neo4j/neo4j-schema';

// Export adaptateurs AI
export * from './adapters/server/ai/openai-embedding.adapter';
export * from './adapters/server/ai/openai.adapter';
export * from './adapters/server/ai/agents/web-topic-discovery.agent';
export * from './adapters/server/ai/agents/rss-feed-qualification.adapter';

// Export adaptateurs SEO
export * from './adapters/server/seo';

// Export logging adapter
export * from './adapters/server/logging/log.adapter';

// Export parsers
export * from './adapters/server/parsers/mdx-parser.adapter';

// Export schemas

// Export repositories
// Note: MarkdownArticleRepository is DEPRECATED - use MdxArticleStructureRepository instead
export * from './adapters/server/persistence/repositories/github-article-structure.repository';
export * from './adapters/server/persistence/repositories/mdx-article-structure.repository';

// SEO
export * from './adapters/server/seo/index';

// News
// Nouvelle stack de collecte d'articles
export * from './adapters/server/news'; // Utiliser l'index du dossier news
export * from './adapters/server/news/newsapi-article-fetcher.adapter';
export * from './adapters/server/news/rss-article-fetcher.adapter';

// Ancien adaptateur RSS supprimé - Remplacé par la nouvelle stack ArticleFetcherPort

// AI (texte, image)
export * from './adapters/server/ai/generic-image.adapter';
export * from './adapters/server/ai/openai.adapter';
// AI Workflows
export * from './adapters/server/ai/workflows/article-generation/article-generation.workflow';
export * from './adapters/server/ai/workflows/article-generation/article-generation.state';

// Publication
export * from './adapters/server/publishers/fs-article-publisher.adapter';
export * from './adapters/server/publishers/github-article-publisher.adapter';

// Images uploaders
export * from './adapters/server/images/fs-image-uploader.adapter';
export * from './adapters/server/images/github-image-uploader.adapter';
