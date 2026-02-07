/**
 * RSS Routes
 * Handles RSS feed discovery
 */

import { Hono } from 'hono';

import discoverRssRoute from './discover';
import discoverRssStreamRoute from './discover-stream';
import subscribeRoute from './subscribe';
import subscriptionsRoute from './subscriptions';

const rss = new Hono();

// Mount routes
rss.route('/', discoverRssRoute); // POST /rss/discover (standard)
rss.route('/', discoverRssStreamRoute); // POST /rss/discover-stream (SSE streaming)
rss.route('/', subscribeRoute); // POST /rss/subscribe
rss.route('/', subscriptionsRoute); // GET/PATCH/DELETE /rss/subscriptions/*

export default rss;
