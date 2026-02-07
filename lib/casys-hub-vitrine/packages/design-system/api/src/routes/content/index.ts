import { Hono } from 'hono';

import generateRoute from './generate';
import { graphRoutes } from './graph';
import { indexingArticlesRoutes } from './indexing';
import { listArticlesRoutes } from './list';

const content = new Hono();

// Routes du contenu (use cases uniquement)
// ⚠️ ORDRE IMPORTANT : routes spécifiques AVANT les patterns génériques
content.route('/', generateRoute); // POST /content/generate (Article generation with streaming)
content.route('/', graphRoutes); // GET /content/graph (Graph visualization data)
content.route('/', indexingArticlesRoutes); // POST /content/articles/... (IndexArticlesUseCase)
content.route('/', listArticlesRoutes); // GET /content/articles/... (ListArticlesUseCase)

export default content;
