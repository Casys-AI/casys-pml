import { Hono } from 'hono';

import generateRoute from './generate';
import { indexingComponentsRoutes } from './indexing';
import listRoute from './list';

const components = new Hono();

// Routes des composants (use cases uniquement)
components.route('/', generateRoute); // POST /components/generate (GenerateComponentFromCommentUseCase)
components.route('/', listRoute); // GET /components/list (ListComponentsUseCase)
components.route('/', indexingComponentsRoutes); // GET/POST /components/index (IndexComponentsUseCase)

export default components;
