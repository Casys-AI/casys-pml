/**
 * Fresh 2.x Application Entry Point
 *
 * Defines the Fresh app with static files and filesystem routing
 */

import { App, staticFiles } from "fresh";

export const app = new App()
  .use(staticFiles())
  .fsRoutes();
