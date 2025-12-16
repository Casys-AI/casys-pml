# Test Plan: MCP Gateway Refactoring Unit Tests

**Date:** 2025-12-16
**Status:** Planning Phase
**Target:** Unit tests for modular MCP Gateway architecture

## Executive Summary

This test plan provides comprehensive unit test specifications for the refactored MCP Gateway modules. The gateway was decomposed from a monolithic 694-line file into 13 specialized modules across 5 domains: routing, connections, server lifecycle, responses, metrics, and registry.

**Key Testing Principles:**
- Focus on unit-level isolation with mocked dependencies
- Test both happy paths and comprehensive edge cases
- Validate error handling and boundary conditions
- Ensure type safety and runtime validation
- Test concurrent operations and race conditions

---

## Module Structure Overview

```
src/mcp/
├── connections/
│   ├── manager.ts          (117 lines) - Connection lifecycle management
│   ├── pool.ts             (114 lines) - Connection pooling with idle timeout
│   └── types.ts            (43 lines)  - Connection types and interfaces
├── routing/
│   ├── router.ts           (78 lines)  - Main request routing dispatcher
│   ├── dispatcher.ts       (139 lines) - Pattern matching and route dispatch
│   ├── middleware.ts       (89 lines)  - CORS, auth, rate limiting
│   ├── types.ts            (69 lines)  - Routing types and helpers
│   └── handlers/
│       ├── graph.ts        (356 lines) - Graph API endpoints
│       ├── capabilities.ts (369 lines) - Capabilities API endpoints
│       ├── metrics.ts      (61 lines)  - Metrics API endpoint
│       ├── tools.ts        (58 lines)  - Tools search endpoint
│       └── health.ts       (87 lines)  - Health check endpoints
├── server/
│   ├── lifecycle.ts        (78 lines)  - Server start/stop/restart
│   └── health.ts           (88 lines)  - Health status management
├── responses/
│   ├── formatter.ts        (150 lines) - MCP response formatting
│   └── errors.ts           (65 lines)  - Error response helpers
├── metrics/
│   └── collector.ts        (119 lines) - Metrics collection
└── registry/
    ├── tool-registry.ts    (128 lines) - Tool registration and lookup
    └── discovery.ts        (37 lines)  - Tool discovery interfaces
```

---

## Test File Organization

```
tests/unit/mcp/
├── connections/
│   ├── manager.test.ts
│   ├── pool.test.ts
│   └── pool-concurrency.test.ts
├── routing/
│   ├── router.test.ts
│   ├── dispatcher.test.ts
│   ├── middleware.test.ts
│   └── handlers/
│       ├── graph.test.ts
│       ├── capabilities.test.ts
│       ├── metrics.test.ts
│       ├── tools.test.ts
│       └── health.test.ts
├── server/
│   ├── lifecycle.test.ts
│   └── health.test.ts
├── responses/
│   ├── formatter.test.ts
│   └── errors.test.ts
├── metrics/
│   └── collector.test.ts
└── registry/
    └── tool-registry.test.ts
```

---

## 1. Connection Management Tests

### 1.1 ConnectionManager (`tests/unit/mcp/connections/manager.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/connections/manager.ts`

**Core Responsibilities:**
- Register MCP clients with connection metadata
- Maintain connection status (connected/disconnected/connecting/error)
- Handle graceful disconnect for single or all clients
- Track connection lifecycle timestamps

#### Test Cases

##### 1.1.1 Basic Registration and Retrieval

**Test:** `register() stores client with connection metadata`
- **Setup:** Create ConnectionManager, mock MCPClientBase
- **Action:** Call `register('server-1', mockClient)`
- **Assertions:**
  - `get('server-1')` returns the registered client
  - `getInfo('server-1')` returns ConnectionInfo with status='connected'
  - `connectedAt` is set to current timestamp
  - `lastActivityAt` is set to current timestamp
  - `size` property equals 1

**Test:** `get() returns undefined for non-existent server`
- **Setup:** Create ConnectionManager
- **Action:** Call `get('non-existent')`
- **Assertion:** Returns `undefined`

**Test:** `register() overwrites existing connection`
- **Setup:** Register client1 for 'server-1'
- **Action:** Register client2 for 'server-1'
- **Assertions:**
  - `get('server-1')` returns client2, not client1
  - `size` remains 1 (no duplicate)

##### 1.1.2 Status Management

**Test:** `updateStatus() updates connection status and activity timestamp`
- **Setup:** Register client
- **Action:** Wait 10ms, call `updateStatus('server-1', 'error', 'Connection failed')`
- **Assertions:**
  - `getInfo().status` equals 'error'
  - `getInfo().errorMessage` equals 'Connection failed'
  - `getInfo().lastActivityAt` is more recent than original timestamp

**Test:** `updateStatus() for non-existent server does nothing (no error)`
- **Setup:** Empty ConnectionManager
- **Action:** Call `updateStatus('ghost', 'connected')`
- **Assertion:** No error thrown

**Test:** `updateStatus() clears error message when transitioning to connected`
- **Setup:** Register client with error status
- **Action:** `updateStatus('server-1', 'connected')`
- **Assertion:** `getInfo().errorMessage` should persist (no clearing implemented)
- **Note:** Current implementation doesn't clear errorMessage - document this behavior

##### 1.1.3 Disconnect Operations

**Test:** `disconnect() calls client.disconnect() and updates status`
- **Setup:** Register client with `disconnect()` method that returns Promise
- **Action:** Call `disconnect('server-1')`
- **Assertions:**
  - Mock client.disconnect() was called once
  - `getInfo().status` equals 'disconnected'
  - `lastActivityAt` updated

**Test:** `disconnect() handles client.disconnect() errors gracefully`
- **Setup:** Register client whose disconnect() rejects with error
- **Action:** Call `disconnect('server-1')`
- **Assertions:**
  - No exception propagated
  - `getInfo().status` equals 'error'
  - `getInfo().errorMessage` contains error text

**Test:** `disconnect() for non-existent server does nothing (no error)`
- **Setup:** Empty ConnectionManager
- **Action:** Call `disconnect('ghost')`
- **Assertion:** No error thrown

**Test:** `disconnectAll() disconnects all registered clients`
- **Setup:** Register 3 clients
- **Action:** Call `disconnectAll()`
- **Assertions:**
  - All 3 mock clients had disconnect() called
  - All 3 connections have status='disconnected'

**Test:** `disconnectAll() handles partial failures gracefully`
- **Setup:** Register 3 clients: client1 (succeeds), client2 (throws), client3 (succeeds)
- **Action:** Call `disconnectAll()`
- **Assertions:**
  - client1 status='disconnected'
  - client2 status='error'
  - client3 status='disconnected'
  - No exception propagated

##### 1.1.4 Collection Operations

**Test:** `getServerIds() returns all registered server IDs`
- **Setup:** Register 'server-a', 'server-b', 'server-c'
- **Action:** Call `getServerIds()`
- **Assertion:** Returns array containing exactly ['server-a', 'server-b', 'server-c']

**Test:** `getClientsMap() returns Map of server IDs to clients`
- **Setup:** Register 3 clients
- **Action:** Call `getClientsMap()`
- **Assertions:**
  - Returns Map instance
  - Map.size equals 3
  - Map keys match registered server IDs
  - Map values match registered clients

**Test:** `size property returns correct count`
- **Setup:** Start with 0, register 3, disconnect 1
- **Assertions:**
  - Initial size = 0
  - After registration size = 3
  - After disconnect size = 3 (disconnected connections still tracked)

##### 1.1.5 Edge Cases and Error Scenarios

**Test:** `register() with same serverId twice creates single entry`
- **Setup:** Register same serverId twice with different clients
- **Action:** Check size and retrieval
- **Assertion:** Only latest client is stored, size = 1

**Test:** `getInfo() returns undefined for non-existent server`
- **Setup:** Empty ConnectionManager
- **Action:** Call `getInfo('ghost')`
- **Assertion:** Returns `undefined`

**Test:** `concurrent operations don't corrupt internal state`
- **Setup:** ConnectionManager with 5 clients
- **Action:** Concurrently call register(), get(), updateStatus(), disconnect()
- **Assertion:** Final state is consistent (no race conditions)

---

### 1.2 ConnectionPool (`tests/unit/mcp/connections/pool.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/connections/pool.ts`

**Core Responsibilities:**
- Manage connection pool with max connection limit
- Implement idle connection timeout
- Reuse existing connections when available
- Automatically disconnect idle connections

#### Test Cases

##### 1.2.1 Basic Pooling Operations

**Test:** `acquire() creates new connection if none exists`
- **Setup:** Create ConnectionPool with default config
- **Action:** Call `acquire('server-1', mockFactory)`
- **Assertions:**
  - Factory function was called once
  - Returns the created client
  - Pool size = 1

**Test:** `acquire() reuses existing connection`
- **Setup:** Acquire connection for 'server-1'
- **Action:** Acquire 'server-1' again with different factory
- **Assertions:**
  - Factory function NOT called second time
  - Returns same client instance
  - Pool size = 1

**Test:** `acquire() creates separate connections for different serverIds`
- **Setup:** ConnectionPool
- **Action:** Acquire 'server-1', then 'server-2'
- **Assertions:**
  - Factory called twice
  - Returns different client instances
  - Pool size = 2

**Test:** `release() resets idle timer`
- **Setup:** Acquire connection with short idle timeout (100ms)
- **Action:** Wait 50ms, call `release()`, wait another 60ms
- **Assertions:**
  - Connection still exists after 110ms total (timer reset worked)
  - Wait another 50ms, connection should be disconnected

##### 1.2.2 Pool Limits

**Test:** `acquire() throws when pool is exhausted`
- **Setup:** Create ConnectionPool with maxConnections=2
- **Action:** Acquire 'server-1', 'server-2', then attempt 'server-3'
- **Assertion:** Third acquire throws error with message "Connection pool exhausted"

**Test:** `acquire() succeeds after connection is removed`
- **Setup:** Pool with maxConnections=2, acquire 2 connections
- **Action:** Manually disconnect one, then acquire new connection
- **Assertion:** Third acquire succeeds (pool slot freed)

##### 1.2.3 Idle Timeout

**Test:** `idle timeout disconnects unused connections`
- **Setup:** Pool with idleTimeout=200ms
- **Action:** Acquire connection, then wait 250ms
- **Assertions:**
  - Connection no longer in pool
  - Client.disconnect() was called
  - Idle timer was cleared

**Test:** `idle timer resets on each acquire()`
- **Setup:** Pool with idleTimeout=100ms
- **Action:** Acquire 'server-1', wait 60ms, acquire 'server-1' again, wait 60ms
- **Assertion:** Connection still active after 120ms total

**Test:** `multiple connections have independent idle timers`
- **Setup:** Pool with idleTimeout=100ms
- **Action:**
  - t=0ms: Acquire 'server-1'
  - t=50ms: Acquire 'server-2'
  - t=120ms: Check pool
- **Assertions:**
  - 'server-1' disconnected (120ms elapsed)
  - 'server-2' still connected (70ms elapsed)

##### 1.2.4 Connection Factory Errors

**Test:** `acquire() propagates factory errors`
- **Setup:** Factory function that throws Error
- **Action:** Call `acquire('server-1', throwingFactory)`
- **Assertion:** Error propagates to caller, pool size = 0

**Test:** `acquire() propagates factory async errors`
- **Setup:** Factory function that returns rejected Promise
- **Action:** Call `acquire('server-1', rejectingFactory)`
- **Assertion:** Promise rejection propagates, pool size = 0

##### 1.2.5 Cleanup Operations

**Test:** `close() disconnects all connections`
- **Setup:** Pool with 3 active connections
- **Action:** Call `close()`
- **Assertions:**
  - All 3 clients had disconnect() called
  - All idle timers cleared
  - Pool is empty

**Test:** `close() clears all idle timers`
- **Setup:** Pool with 2 connections, long idle timeout
- **Action:** Call `close()` immediately
- **Assertion:** No timers remain active (no memory leak)

**Test:** `close() handles disconnect errors gracefully`
- **Setup:** 3 connections, one throws on disconnect
- **Action:** Call `close()`
- **Assertion:** Other 2 connections still disconnected, no exception propagated

##### 1.2.6 Configuration

**Test:** `default configuration values are applied`
- **Setup:** Create ConnectionPool without config parameter
- **Action:** Check behavior
- **Assertions:**
  - maxConnections = 50 (can add 50 connections)
  - idleTimeout = 300000ms (connections persist for 5 minutes)
  - connectionTimeout = 30000ms

**Test:** `partial configuration merges with defaults`
- **Setup:** Create ConnectionPool({ maxConnections: 10 })
- **Assertions:**
  - maxConnections = 10
  - idleTimeout = 300000 (default)
  - connectionTimeout = 30000 (default)

**Test:** `zero maxConnections is respected`
- **Setup:** Create ConnectionPool({ maxConnections: 0 })
- **Action:** Attempt to acquire any connection
- **Assertion:** Throws "Connection pool exhausted"

##### 1.2.7 Manager Integration

**Test:** `getManager() returns underlying ConnectionManager`
- **Setup:** Create ConnectionPool
- **Action:** Call `getManager()`
- **Assertions:**
  - Returns ConnectionManager instance
  - Manager operations work correctly

---

### 1.3 ConnectionPool Concurrency Tests (`tests/unit/mcp/connections/pool-concurrency.test.ts`)

**Focus:** Race conditions, concurrent operations, stress testing

#### Test Cases

**Test:** `concurrent acquire() calls for same serverId share single connection`
- **Setup:** Pool with slow factory (100ms delay)
- **Action:** Start 5 concurrent `acquire('server-1')` calls
- **Assertions:**
  - Factory called exactly once
  - All 5 calls return same client instance
  - No race condition errors

**Test:** `concurrent acquire() calls for different serverIds create separate connections`
- **Setup:** Pool
- **Action:** Start 10 concurrent acquire() calls with different serverIds
- **Assertions:**
  - Factory called 10 times
  - All calls succeed
  - Pool size = 10

**Test:** `acquire() and release() concurrent calls don't corrupt timer state`
- **Setup:** Pool with short idle timeout
- **Action:** Rapidly call acquire() and release() 100 times
- **Assertion:** No timer leaks, pool state consistent

**Test:** `idle timeout during concurrent acquire() doesn't cause errors`
- **Setup:** Pool with very short idle timeout (10ms)
- **Action:** Acquire connection, wait for timeout, then acquire again concurrently
- **Assertion:** Second acquire succeeds, creates new connection

**Test:** `close() during active acquire() completes gracefully`
- **Setup:** Pool with slow factory
- **Action:** Start acquire(), immediately call close()
- **Assertion:** Both operations complete without errors

---

## 2. Routing Tests

### 2.1 RequestDispatcher (`tests/unit/mcp/routing/dispatcher.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/routing/dispatcher.ts`

**Core Responsibilities:**
- Register routes with HTTP methods and path patterns
- Match incoming requests against registered routes
- Extract path parameters from URL patterns
- Dispatch requests to appropriate handlers

#### Test Cases

##### 2.1.1 Route Registration

**Test:** `register() adds route to internal routing table`
- **Setup:** Create RequestDispatcher
- **Action:** Register route with method='GET', pattern='/test', handler=mockHandler
- **Assertion:** Route exists in internal routes array

**Test:** `get() helper registers GET route`
- **Setup:** RequestDispatcher
- **Action:** Call `dispatcher.get('/test', mockHandler)`
- **Assertion:** Equivalent to `register('GET', '/test', mockHandler)`

**Test:** `post() helper registers POST route`
- **Setup:** RequestDispatcher
- **Action:** Call `dispatcher.post('/test', mockHandler)`
- **Assertion:** Equivalent to `register('POST', '/test', mockHandler)`

**Test:** `delete() helper registers DELETE route`
- **Setup:** RequestDispatcher
- **Action:** Call `dispatcher.delete('/test', mockHandler)`
- **Assertion:** Equivalent to `register('DELETE', '/test', mockHandler)`

**Test:** `multiple routes with same path but different methods are distinct`
- **Setup:** Register GET /test, POST /test
- **Action:** Dispatch GET request to /test
- **Assertion:** Only GET handler is called

##### 2.1.2 Simple Path Matching

**Test:** `dispatch() matches exact string paths`
- **Setup:** Register route '/api/health'
- **Action:** Dispatch request to '/api/health'
- **Assertions:**
  - Handler is called
  - Returns handler's response

**Test:** `dispatch() returns null for unmatched path`
- **Setup:** Register route '/api/health'
- **Action:** Dispatch request to '/api/metrics'
- **Assertion:** Returns `null`

**Test:** `dispatch() returns null for wrong HTTP method`
- **Setup:** Register GET route '/api/health'
- **Action:** Dispatch POST request to '/api/health'
- **Assertion:** Returns `null`

**Test:** `method='*' matches any HTTP method`
- **Setup:** Register route with method='*'
- **Action:** Dispatch GET, POST, DELETE requests
- **Assertion:** All match the route

##### 2.1.3 Path Parameter Extraction

**Test:** `dispatch() extracts single path parameter`
- **Setup:** Register route '/api/users/:id'
- **Action:** Dispatch to '/api/users/123'
- **Assertions:**
  - Handler is called
  - ctx.params.id equals '123'

**Test:** `dispatch() extracts multiple path parameters`
- **Setup:** Register route '/api/users/:userId/posts/:postId'
- **Action:** Dispatch to '/api/users/42/posts/99'
- **Assertions:**
  - ctx.params.userId equals '42'
  - ctx.params.postId equals '99'

**Test:** `path parameters can contain special characters`
- **Setup:** Register route '/api/items/:id'
- **Action:** Dispatch to '/api/items/item-123_v2'
- **Assertion:** ctx.params.id equals 'item-123_v2'

**Test:** `path parameter mismatch (different segment count) returns null`
- **Setup:** Register route '/api/users/:id'
- **Action:** Dispatch to '/api/users/123/extra'
- **Assertion:** Returns `null`

**Test:** `path with no parameters still works`
- **Setup:** Register route '/api/users/list'
- **Action:** Dispatch to '/api/users/list'
- **Assertion:** Matches, ctx.params is empty object

##### 2.1.4 Regex Pattern Matching

**Test:** `dispatch() matches regex pattern`
- **Setup:** Register route with pattern=/^\/api\/v\d+\/health$/
- **Action:** Dispatch to '/api/v1/health'
- **Assertion:** Handler is called

**Test:** `regex pattern can extract named groups`
- **Setup:** Register route with pattern=/^\/api\/(?<version>v\d+)\/health$/
- **Action:** Dispatch to '/api/v2/health'
- **Assertions:**
  - Handler is called
  - ctx.params.version equals 'v2'

**Test:** `regex pattern non-match returns null`
- **Setup:** Register route with pattern=/^\/api\/v\d+\/health$/
- **Action:** Dispatch to '/api/health'
- **Assertion:** Returns `null`

##### 2.1.5 Route Priority and Ordering

**Test:** `routes are matched in registration order`
- **Setup:**
  - Register '/api/*' (wildcard) first
  - Register '/api/health' (specific) second
- **Action:** Dispatch to '/api/health'
- **Assertion:** First handler (wildcard) is called, not second

**Test:** `specific routes should be registered before generic ones`
- **Setup:**
  - Register '/api/health' first
  - Register '/api/:resource' second
- **Action:** Dispatch to '/api/health'
- **Assertion:** First handler is called

##### 2.1.6 Handler Execution

**Test:** `dispatch() passes correct arguments to handler`
- **Setup:** Register route with spy handler
- **Action:** Dispatch request
- **Assertions:**
  - Handler called with (req, url, ctx, corsHeaders)
  - req is Request object
  - url is URL object
  - ctx contains graphEngine, vectorSearch, etc.
  - corsHeaders is object

**Test:** `dispatch() returns handler's response`
- **Setup:** Register route with handler that returns Response('test')
- **Action:** Dispatch request
- **Assertion:** dispatch() returns same Response object

**Test:** `dispatch() propagates handler errors`
- **Setup:** Register route with handler that throws Error
- **Action:** Dispatch request
- **Assertion:** Error propagates to caller

**Test:** `dispatch() awaits async handlers`
- **Setup:** Register route with async handler (100ms delay)
- **Action:** Dispatch request
- **Assertion:** dispatch() awaits completion, returns response

##### 2.1.7 Edge Cases

**Test:** `empty path pattern matches root path`
- **Setup:** Register route with pattern=''
- **Action:** Dispatch to '/'
- **Assertion:** Handler is called

**Test:** `trailing slash is significant (no normalization)`
- **Setup:** Register route '/api/health'
- **Action:** Dispatch to '/api/health/'
- **Assertion:** Returns `null` (doesn't match)

**Test:** `query parameters don't affect path matching`
- **Setup:** Register route '/api/health'
- **Action:** Dispatch to '/api/health?detailed=true'
- **Assertion:** Handler is called (query params in url object)

**Test:** `URL fragment doesn't affect path matching`
- **Setup:** Register route '/api/health'
- **Action:** Dispatch to '/api/health#section'
- **Assertion:** Handler is called

---

### 2.2 Router (`tests/unit/mcp/routing/router.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/routing/router.ts`

**Core Responsibilities:**
- Main routing entry point for all HTTP requests
- Delegate to specialized handler functions
- Return null for unmatched routes

#### Test Cases

##### 2.2.1 Route Delegation

**Test:** `routeRequest() delegates /health to handleHealthRoutes()`
- **Setup:** Mock all handler functions, create request to /health
- **Action:** Call `routeRequest(req, url, ctx, corsHeaders)`
- **Assertions:**
  - handleHealthRoutes() was called
  - Other handler functions not called

**Test:** `routeRequest() delegates /api/graph/* to handleGraphRoutes()`
- **Setup:** Mock handlers, create request to /api/graph/snapshot
- **Action:** Call `routeRequest()`
- **Assertion:** handleGraphRoutes() was called

**Test:** `routeRequest() delegates /api/capabilities to handleCapabilitiesRoutes()`
- **Setup:** Mock handlers, create request to /api/capabilities
- **Action:** Call `routeRequest()`
- **Assertion:** handleCapabilitiesRoutes() was called

**Test:** `routeRequest() delegates /api/metrics to handleMetricsRoutes()`
- **Setup:** Mock handlers
- **Action:** Call with /api/metrics
- **Assertion:** handleMetricsRoutes() was called

**Test:** `routeRequest() delegates /api/tools/* to handleToolsRoutes()`
- **Setup:** Mock handlers
- **Action:** Call with /api/tools/search
- **Assertion:** handleToolsRoutes() was called

##### 2.2.2 Unmatched Routes

**Test:** `routeRequest() returns null for unknown path`
- **Setup:** Mock all handlers to return null
- **Action:** Call with path '/unknown'
- **Assertion:** Returns `null`

**Test:** `routeRequest() checks routes in order (health first)`
- **Setup:** Request to /health
- **Action:** Call `routeRequest()`
- **Assertion:** handleHealthRoutes() called first, others not called if match

##### 2.2.3 Error Propagation

**Test:** `routeRequest() propagates handler errors`
- **Setup:** Mock handleGraphRoutes() to throw Error
- **Action:** Call with /api/graph/snapshot
- **Assertion:** Error propagates to caller

**Test:** `routeRequest() propagates async handler errors`
- **Setup:** Mock handler returns rejected Promise
- **Action:** Call `routeRequest()`
- **Assertion:** Promise rejection propagates

##### 2.2.4 Logging

**Test:** `logRoutes() logs all available routes`
- **Setup:** Spy on log.info
- **Action:** Call `logRoutes()`
- **Assertions:**
  - log.info called multiple times
  - Output includes all route paths

---

### 2.3 Middleware (`tests/unit/mcp/routing/middleware.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/routing/middleware.ts`

**Core Responsibilities:**
- CORS header generation
- Public route identification
- Auth and rate limiting responses

#### Test Cases

##### 2.3.1 Public Routes

**Test:** `isPublicRoute() returns true for /health`
- **Action:** Call `isPublicRoute('/health')`
- **Assertion:** Returns `true`

**Test:** `isPublicRoute() returns false for non-public routes`
- **Action:** Call `isPublicRoute('/api/graph/snapshot')`
- **Assertion:** Returns `false`

**Test:** `isPublicRoute() is case-sensitive`
- **Action:** Call `isPublicRoute('/HEALTH')`
- **Assertion:** Returns `false`

##### 2.3.2 CORS Origin Detection

**Test:** `getAllowedOrigin() uses DOMAIN env var if set`
- **Setup:** Set Deno.env.set('DOMAIN', 'example.com')
- **Action:** Call `getAllowedOrigin()`
- **Assertions:**
  - Returns 'https://example.com'
  - Uses https:// protocol

**Test:** `getAllowedOrigin() falls back to localhost with FRESH_PORT`
- **Setup:** No DOMAIN, set Deno.env.set('FRESH_PORT', '3000')
- **Action:** Call `getAllowedOrigin()`
- **Assertion:** Returns 'http://localhost:3000'

**Test:** `getAllowedOrigin() uses default port 8081 if FRESH_PORT not set`
- **Setup:** No DOMAIN, no FRESH_PORT
- **Action:** Call `getAllowedOrigin()`
- **Assertion:** Returns 'http://localhost:8081'

##### 2.3.3 CORS Headers

**Test:** `buildCorsHeaders() returns correct headers with default origin`
- **Setup:** No allowedOrigin parameter
- **Action:** Call `buildCorsHeaders()`
- **Assertions:**
  - Headers contain 'Access-Control-Allow-Origin'
  - Headers contain 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE'
  - Headers contain 'Access-Control-Allow-Headers': 'Content-Type, x-api-key'

**Test:** `buildCorsHeaders() uses provided allowedOrigin`
- **Setup:** None
- **Action:** Call `buildCorsHeaders('https://custom.com')`
- **Assertion:** 'Access-Control-Allow-Origin' equals 'https://custom.com'

##### 2.3.4 Preflight Handling

**Test:** `handleCorsPrelight() returns empty response with CORS headers`
- **Setup:** corsHeaders object
- **Action:** Call `handleCorsPrelight(corsHeaders)`
- **Assertions:**
  - Response has null body
  - Response headers include all corsHeaders

##### 2.3.5 Error Responses

**Test:** `unauthorizedResponse() returns 401 with error message`
- **Setup:** corsHeaders object
- **Action:** Call `unauthorizedResponse(corsHeaders)`
- **Assertions:**
  - Status = 401
  - Body contains 'error': 'Unauthorized'
  - Body contains 'message': 'Valid API key required'
  - Headers include CORS headers
  - Content-Type = application/json

**Test:** `rateLimitResponse() returns 429 with retry-after`
- **Setup:** corsHeaders object
- **Action:** Call `rateLimitResponse(corsHeaders)`
- **Assertions:**
  - Status = 429
  - Body contains 'error': 'Rate limit exceeded'
  - Headers include 'Retry-After': '60'
  - Headers include CORS headers

---

## 3. HTTP Handler Tests

### 3.1 Graph Handlers (`tests/unit/mcp/routing/handlers/graph.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/routing/handlers/graph.ts`

**Endpoints:**
- GET /api/graph/snapshot
- GET /api/graph/path
- GET /api/graph/related
- GET /api/graph/hypergraph

#### Test Cases

##### 3.1.1 GET /api/graph/snapshot

**Test:** `handleGraphSnapshot() returns graph snapshot from engine`
- **Setup:** Mock ctx.graphEngine.getGraphSnapshot() to return test data
- **Action:** Call `handleGraphSnapshot(req, url, ctx, corsHeaders)`
- **Assertions:**
  - Status = 200
  - Body contains snapshot data
  - CORS headers present

**Test:** `handleGraphSnapshot() handles engine errors`
- **Setup:** Mock graphEngine.getGraphSnapshot() to throw Error
- **Action:** Call `handleGraphSnapshot()`
- **Assertions:**
  - Status = 500
  - Body contains error message
  - Error is logged

##### 3.1.2 GET /api/graph/path

**Test:** `handleGraphPath() returns shortest path with valid params`
- **Setup:**
  - URL with ?from=node1&to=node2
  - Mock graphEngine.findShortestPath() returns ['node1', 'intermediate', 'node2']
- **Action:** Call `handleGraphPath()`
- **Assertions:**
  - Status = 200
  - Body contains path array
  - Body contains total_hops = 2
  - Body contains from, to values

**Test:** `handleGraphPath() returns 400 for missing 'from' parameter`
- **Setup:** URL with ?to=node2 (no 'from')
- **Action:** Call `handleGraphPath()`
- **Assertions:**
  - Status = 400
  - Body contains error about missing parameters

**Test:** `handleGraphPath() returns 400 for missing 'to' parameter`
- **Setup:** URL with ?from=node1 (no 'to')
- **Action:** Call `handleGraphPath()`
- **Assertion:** Status = 400

**Test:** `handleGraphPath() handles no path found (returns empty array)`
- **Setup:** Mock findShortestPath() returns null
- **Action:** Call `handleGraphPath()`
- **Assertions:**
  - Status = 200
  - Body path = []
  - Body total_hops = -1

**Test:** `handleGraphPath() handles engine errors`
- **Setup:** Mock findShortestPath() throws Error
- **Action:** Call `handleGraphPath()`
- **Assertion:** Status = 500

##### 3.1.3 GET /api/graph/related

**Test:** `handleGraphRelated() returns related tools with valid tool_id`
- **Setup:**
  - URL with ?tool_id=server:tool1&limit=5
  - Mock computeAdamicAdar() returns similarity results
- **Action:** Call `handleGraphRelated()`
- **Assertions:**
  - Status = 200
  - Body contains tool_id
  - Body contains related array with scores
  - Each result has server, name extracted

**Test:** `handleGraphRelated() uses default limit=5 if not specified`
- **Setup:** URL with ?tool_id=server:tool1 (no limit)
- **Action:** Call `handleGraphRelated()`
- **Assertion:** computeAdamicAdar() called with limit=5

**Test:** `handleGraphRelated() returns 400 for missing tool_id`
- **Setup:** URL with no tool_id parameter
- **Action:** Call `handleGraphRelated()`
- **Assertion:** Status = 400

**Test:** `handleGraphRelated() enriches results with edge confidence`
- **Setup:** Mock getEdgeData() returns weight
- **Action:** Call `handleGraphRelated()`
- **Assertion:** Results include edge_confidence field

**Test:** `handleGraphRelated() handles tools without ':' separator`
- **Setup:** computeAdamicAdar() returns result with toolId='single_name'
- **Action:** Call `handleGraphRelated()`
- **Assertions:**
  - server = 'unknown'
  - name = 'single_name'

**Test:** `handleGraphRelated() rounds Adamic-Adar scores to 3 decimals`
- **Setup:** Mock returns score=0.12345678
- **Action:** Call `handleGraphRelated()`
- **Assertion:** Response has adamic_adar_score=0.123

##### 3.1.4 GET /api/graph/hypergraph

**Test:** `handleGraphHypergraph() returns hypergraph data with defaults`
- **Setup:** Mock capabilityDataService.buildHypergraphData()
- **Action:** Call with no query params
- **Assertions:**
  - Status = 200
  - Body contains nodes, edges arrays
  - Body contains capability_zones
  - Body contains counts and metadata

**Test:** `handleGraphHypergraph() respects include_tools=false parameter`
- **Setup:** URL with ?include_tools=false
- **Action:** Call `handleGraphHypergraph()`
- **Assertion:** buildHypergraphData() called with includeTools=false

**Test:** `handleGraphHypergraph() applies min_success_rate filter`
- **Setup:** URL with ?min_success_rate=0.8
- **Action:** Call `handleGraphHypergraph()`
- **Assertion:** buildHypergraphData() called with minSuccessRate=0.8

**Test:** `handleGraphHypergraph() validates min_success_rate range`
- **Setup:** URL with ?min_success_rate=1.5 (invalid)
- **Action:** Call `handleGraphHypergraph()`
- **Assertion:** Status = 400

**Test:** `handleGraphHypergraph() applies min_usage filter`
- **Setup:** URL with ?min_usage=10
- **Action:** Call `handleGraphHypergraph()`
- **Assertion:** buildHypergraphData() called with minUsage=10

**Test:** `handleGraphHypergraph() validates min_usage >= 0`
- **Setup:** URL with ?min_usage=-5 (invalid)
- **Action:** Call `handleGraphHypergraph()`
- **Assertion:** Status = 400

**Test:** `handleGraphHypergraph() returns 503 if capabilityDataService not configured`
- **Setup:** ctx.capabilityDataService = undefined
- **Action:** Call `handleGraphHypergraph()`
- **Assertion:** Status = 503

**Test:** `handleGraphHypergraph() maps node data to snake_case`
- **Setup:** Mock returns nodes with camelCase properties
- **Action:** Call `handleGraphHypergraph()`
- **Assertions:**
  - Response nodes have code_snippet (not codeSnippet)
  - Response nodes have success_rate (not successRate)

##### 3.1.5 Route Dispatcher

**Test:** `handleGraphRoutes() returns null for non-/api/graph/* paths`
- **Setup:** URL with /api/metrics
- **Action:** Call `handleGraphRoutes()`
- **Assertion:** Returns `null`

**Test:** `handleGraphRoutes() returns 405 for non-GET methods`
- **Setup:** POST request to /api/graph/snapshot
- **Action:** Call `handleGraphRoutes()`
- **Assertion:** Status = 405

**Test:** `handleGraphRoutes() dispatches to correct handler by path`
- **Action:** Call with each graph endpoint
- **Assertion:** Correct handler function executed

---

### 3.2 Capabilities Handlers (`tests/unit/mcp/routing/handlers/capabilities.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/routing/handlers/capabilities.ts`

**Endpoints:**
- GET /api/capabilities
- GET /api/capabilities/:id/dependencies
- POST /api/capabilities/:id/dependencies
- DELETE /api/capabilities/:from/dependencies/:to

#### Test Cases

##### 3.2.1 GET /api/capabilities (List)

**Test:** `handleListCapabilities() returns capabilities list with no filters`
- **Setup:** Mock capabilityDataService.listCapabilities()
- **Action:** Call with no query params
- **Assertions:**
  - Status = 200
  - Body contains capabilities array
  - Body contains total, limit, offset
  - Each capability has dependencies_count field

**Test:** `handleListCapabilities() applies community_id filter`
- **Setup:** URL with ?community_id=3
- **Action:** Call `handleListCapabilities()`
- **Assertion:** listCapabilities() called with filters.communityId=3

**Test:** `handleListCapabilities() applies min_success_rate filter`
- **Setup:** URL with ?min_success_rate=0.9
- **Action:** Call `handleListCapabilities()`
- **Assertion:** filters.minSuccessRate=0.9

**Test:** `handleListCapabilities() validates min_success_rate range (0-1)`
- **Setup:** URL with ?min_success_rate=2.0
- **Action:** Call `handleListCapabilities()`
- **Assertion:** Status = 400

**Test:** `handleListCapabilities() applies min_usage filter`
- **Setup:** URL with ?min_usage=5
- **Action:** Call `handleListCapabilities()`
- **Assertion:** filters.minUsage=5

**Test:** `handleListCapabilities() validates min_usage >= 0`
- **Setup:** URL with ?min_usage=-1
- **Action:** Call `handleListCapabilities()`
- **Assertion:** Status = 400

**Test:** `handleListCapabilities() applies limit with cap at 100`
- **Setup:** URL with ?limit=200
- **Action:** Call `handleListCapabilities()`
- **Assertion:** filters.limit=100 (capped)

**Test:** `handleListCapabilities() applies offset filter`
- **Setup:** URL with ?offset=20
- **Action:** Call `handleListCapabilities()`
- **Assertion:** filters.offset=20

**Test:** `handleListCapabilities() validates offset >= 0`
- **Setup:** URL with ?offset=-5
- **Action:** Call `handleListCapabilities()`
- **Assertion:** Status = 400

**Test:** `handleListCapabilities() applies sort parameter`
- **Setup:** URL with ?sort=usage_count
- **Action:** Call `handleListCapabilities()`
- **Assertion:** filters.sort='usageCount'

**Test:** `handleListCapabilities() maps all sort options correctly`
- **Action:** Test each: usage_count, success_rate, last_used, created_at
- **Assertion:** Correct camelCase mapping

**Test:** `handleListCapabilities() applies order parameter`
- **Setup:** URL with ?order=asc
- **Action:** Call `handleListCapabilities()`
- **Assertion:** filters.order='asc'

**Test:** `handleListCapabilities() validates order values (asc/desc)`
- **Setup:** URL with ?order=invalid
- **Action:** Call `handleListCapabilities()`
- **Assertion:** order parameter ignored (not validated as error)

**Test:** `handleListCapabilities() returns 503 if service not initialized`
- **Setup:** ctx.capabilityDataService = undefined
- **Action:** Call `handleListCapabilities()`
- **Assertion:** Status = 503

**Test:** `handleListCapabilities() maps response to snake_case`
- **Setup:** Mock returns capabilities with camelCase properties
- **Action:** Call `handleListCapabilities()`
- **Assertions:**
  - Response has code_snippet (not codeSnippet)
  - Response has tools_used (not toolsUsed)
  - Response has success_rate, usage_count, etc.

##### 3.2.2 GET /api/capabilities/:id/dependencies

**Test:** `handleGetDependencies() returns dependencies for capability`
- **Setup:** Mock capabilityStore.getDependencies() returns test dependencies
- **Action:** Call with capabilityId='cap-123', direction='both'
- **Assertions:**
  - Status = 200
  - Body contains capability_id
  - Body contains dependencies array
  - Body contains total count

**Test:** `handleGetDependencies() uses default direction='both'`
- **Setup:** URL with no direction parameter
- **Action:** Call `handleGetDependencies()`
- **Assertion:** getDependencies() called with direction='both'

**Test:** `handleGetDependencies() applies direction='from' filter`
- **Setup:** URL with ?direction=from
- **Action:** Call `handleGetDependencies()`
- **Assertion:** getDependencies() called with direction='from'

**Test:** `handleGetDependencies() applies direction='to' filter`
- **Setup:** URL with ?direction=to
- **Action:** Call `handleGetDependencies()`
- **Assertion:** getDependencies() called with direction='to'

**Test:** `handleGetDependencies() validates direction values`
- **Setup:** URL with ?direction=invalid
- **Action:** Call `handleGetDependencies()`
- **Assertion:** Status = 400

**Test:** `handleGetDependencies() returns 503 if store not initialized`
- **Setup:** ctx.capabilityStore = undefined
- **Action:** Call `handleGetDependencies()`
- **Assertion:** Status = 503

**Test:** `handleGetDependencies() maps dates to ISO strings`
- **Setup:** Mock returns dependencies with Date objects
- **Action:** Call `handleGetDependencies()`
- **Assertions:**
  - created_at is ISO string
  - last_observed is ISO string

##### 3.2.3 POST /api/capabilities/:id/dependencies

**Test:** `handleCreateDependency() creates new dependency`
- **Setup:**
  - POST body: { to_capability_id: 'cap-456', edge_type: 'contains' }
  - Mock addDependency() returns created dependency
- **Action:** Call with fromCapabilityId='cap-123'
- **Assertions:**
  - Status = 201
  - Body contains created=true
  - Body contains dependency object
  - addDependency() called with correct params

**Test:** `handleCreateDependency() validates required fields`
- **Setup:** POST body missing to_capability_id
- **Action:** Call `handleCreateDependency()`
- **Assertion:** Status = 400

**Test:** `handleCreateDependency() validates edge_type values`
- **Setup:** POST body with edge_type='invalid'
- **Action:** Call `handleCreateDependency()`
- **Assertion:** Status = 400

**Test:** `handleCreateDependency() accepts all valid edge_types`
- **Action:** Test each: contains, sequence, dependency, alternative
- **Assertion:** All accepted (Status = 201)

**Test:** `handleCreateDependency() uses default edge_source='template'`
- **Setup:** POST body without edge_source
- **Action:** Call `handleCreateDependency()`
- **Assertion:** addDependency() called with edgeSource='template'

**Test:** `handleCreateDependency() respects custom edge_source`
- **Setup:** POST body with edge_source='manual'
- **Action:** Call `handleCreateDependency()`
- **Assertion:** addDependency() called with edgeSource='manual'

**Test:** `handleCreateDependency() returns 503 if store not initialized`
- **Setup:** ctx.capabilityStore = undefined
- **Action:** Call `handleCreateDependency()`
- **Assertion:** Status = 503

##### 3.2.4 DELETE /api/capabilities/:from/dependencies/:to

**Test:** `handleDeleteDependency() removes dependency`
- **Setup:** Mock removeDependency() succeeds
- **Action:** Call with fromCapabilityId='cap-123', toCapabilityId='cap-456'
- **Assertions:**
  - Status = 200
  - Body contains deleted=true
  - removeDependency() called with correct IDs

**Test:** `handleDeleteDependency() returns 503 if store not initialized`
- **Setup:** ctx.capabilityStore = undefined
- **Action:** Call `handleDeleteDependency()`
- **Assertion:** Status = 503

**Test:** `handleDeleteDependency() handles non-existent dependency gracefully`
- **Setup:** Mock removeDependency() throws error
- **Action:** Call `handleDeleteDependency()`
- **Assertion:** Status = 500

##### 3.2.5 Route Dispatcher

**Test:** `handleCapabilitiesRoutes() dispatches GET /api/capabilities`
- **Setup:** GET request to /api/capabilities
- **Action:** Call `handleCapabilitiesRoutes()`
- **Assertion:** handleListCapabilities() executed

**Test:** `handleCapabilitiesRoutes() extracts :id from path`
- **Setup:** GET /api/capabilities/cap-123/dependencies
- **Action:** Call `handleCapabilitiesRoutes()`
- **Assertion:** handleGetDependencies() called with capabilityId='cap-123'

**Test:** `handleCapabilitiesRoutes() dispatches POST dependencies`
- **Setup:** POST /api/capabilities/cap-123/dependencies
- **Action:** Call `handleCapabilitiesRoutes()`
- **Assertion:** handleCreateDependency() executed

**Test:** `handleCapabilitiesRoutes() returns 405 for wrong method on dependencies`
- **Setup:** PUT /api/capabilities/cap-123/dependencies
- **Action:** Call `handleCapabilitiesRoutes()`
- **Assertion:** Status = 405

**Test:** `handleCapabilitiesRoutes() dispatches DELETE with :from and :to`
- **Setup:** DELETE /api/capabilities/cap-1/dependencies/cap-2
- **Action:** Call `handleCapabilitiesRoutes()`
- **Assertion:** handleDeleteDependency() called with fromId='cap-1', toId='cap-2'

**Test:** `handleCapabilitiesRoutes() returns null for non-matching paths`
- **Setup:** GET /api/other
- **Action:** Call `handleCapabilitiesRoutes()`
- **Assertion:** Returns `null`

---

### 3.3 Metrics Handler (`tests/unit/mcp/routing/handlers/metrics.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/routing/handlers/metrics.ts`

**Endpoint:** GET /api/metrics

#### Test Cases

**Test:** `handleMetrics() returns metrics with default range=24h`
- **Setup:** Mock graphEngine.getMetrics()
- **Action:** Call with no query params
- **Assertions:**
  - getMetrics() called with range='24h'
  - Status = 200
  - Body contains metrics data

**Test:** `handleMetrics() respects range=1h parameter`
- **Setup:** URL with ?range=1h
- **Action:** Call `handleMetrics()`
- **Assertion:** getMetrics() called with range='1h'

**Test:** `handleMetrics() respects range=7d parameter`
- **Setup:** URL with ?range=7d
- **Action:** Call `handleMetrics()`
- **Assertion:** getMetrics() called with range='7d'

**Test:** `handleMetrics() validates range parameter`
- **Setup:** URL with ?range=30d (invalid)
- **Action:** Call `handleMetrics()`
- **Assertion:** Status = 400

**Test:** `handleMetrics() handles engine errors`
- **Setup:** Mock getMetrics() throws Error
- **Action:** Call `handleMetrics()`
- **Assertion:** Status = 500

**Test:** `handleMetricsRoutes() dispatches GET /api/metrics`
- **Setup:** GET /api/metrics
- **Action:** Call `handleMetricsRoutes()`
- **Assertion:** handleMetrics() executed

**Test:** `handleMetricsRoutes() returns null for non-matching paths`
- **Setup:** GET /api/other
- **Action:** Call `handleMetricsRoutes()`
- **Assertion:** Returns `null`

---

### 3.4 Tools Handler (`tests/unit/mcp/routing/handlers/tools.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/routing/handlers/tools.ts`

**Endpoint:** GET /api/tools/search

#### Test Cases

**Test:** `handleToolsSearch() returns search results for valid query`
- **Setup:**
  - URL with ?q=file&limit=10
  - Mock graphEngine.searchToolsForAutocomplete() returns results
- **Action:** Call `handleToolsSearch()`
- **Assertions:**
  - Status = 200
  - Body contains results array
  - Body contains total count
  - searchToolsForAutocomplete() called with ('file', 10)

**Test:** `handleToolsSearch() uses default limit=10 if not specified`
- **Setup:** URL with ?q=test (no limit)
- **Action:** Call `handleToolsSearch()`
- **Assertion:** searchToolsForAutocomplete() called with limit=10

**Test:** `handleToolsSearch() returns empty results for query < 2 chars`
- **Setup:** URL with ?q=a
- **Action:** Call `handleToolsSearch()`
- **Assertions:**
  - Status = 200
  - Body results = []
  - Body total = 0
  - searchToolsForAutocomplete() NOT called

**Test:** `handleToolsSearch() handles empty query string`
- **Setup:** URL with no q parameter
- **Action:** Call `handleToolsSearch()`
- **Assertion:** Returns empty results

**Test:** `handleToolsSearch() handles engine errors`
- **Setup:** Mock searchToolsForAutocomplete() throws Error
- **Action:** Call `handleToolsSearch()`
- **Assertion:** Status = 500

**Test:** `handleToolsRoutes() dispatches GET /api/tools/search`
- **Setup:** GET /api/tools/search
- **Action:** Call `handleToolsRoutes()`
- **Assertion:** handleToolsSearch() executed

**Test:** `handleToolsRoutes() returns null for non-matching paths`
- **Setup:** GET /api/tools/other
- **Action:** Call `handleToolsRoutes()`
- **Assertion:** Returns `null`

---

### 3.5 Health Handler (`tests/unit/mcp/routing/handlers/health.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/routing/handlers/health.ts`

**Endpoints:**
- GET /health
- GET /events/stream
- GET /dashboard

#### Test Cases

**Test:** `handleHealth() returns ok status`
- **Action:** Call `handleHealth()`
- **Assertions:**
  - Status = 200
  - Body contains { status: 'ok' }
  - CORS headers present

**Test:** `handleEventsStream() returns SSE stream when eventsStream exists`
- **Setup:** Mock ctx.eventsStream.handleRequest() returns SSE Response
- **Action:** Call `handleEventsStream()`
- **Assertions:**
  - eventsStream.handleRequest() called with request
  - Returns SSE response

**Test:** `handleEventsStream() returns 503 if eventsStream not initialized`
- **Setup:** ctx.eventsStream = null
- **Action:** Call `handleEventsStream()`
- **Assertions:**
  - Status = 503
  - Body contains error message

**Test:** `handleDashboardRedirect() returns 302 redirect`
- **Action:** Call `handleDashboardRedirect()`
- **Assertions:**
  - Status = 302
  - Location header = 'http://localhost:8080/dashboard'

**Test:** `handleHealthRoutes() dispatches GET /health`
- **Setup:** GET /health
- **Action:** Call `handleHealthRoutes()`
- **Assertion:** handleHealth() executed

**Test:** `handleHealthRoutes() dispatches GET /events/stream`
- **Setup:** GET /events/stream
- **Action:** Call `handleHealthRoutes()`
- **Assertion:** handleEventsStream() executed

**Test:** `handleHealthRoutes() dispatches GET /dashboard`
- **Setup:** GET /dashboard
- **Action:** Call `handleHealthRoutes()`
- **Assertion:** handleDashboardRedirect() executed

**Test:** `handleHealthRoutes() returns null for non-matching paths`
- **Setup:** GET /other
- **Action:** Call `handleHealthRoutes()`
- **Assertion:** Returns `null`

---

## 4. Server Lifecycle Tests

### 4.1 Lifecycle (`tests/unit/mcp/server/lifecycle.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/server/lifecycle.ts`

#### Test Cases

**Test:** `createMCPServer() creates Server instance with correct config`
- **Setup:** config = { name: 'test-server', version: '1.0.0' }
- **Action:** Call `createMCPServer(config)`
- **Assertions:**
  - Returns Server instance
  - Server has capabilities.tools and capabilities.prompts

**Test:** `startStdioServer() connects server to stdio transport`
- **Setup:** Mock Server instance, config, empty mcpClients Map
- **Action:** Call `startStdioServer(server, config, mcpClients)`
- **Assertions:**
  - server.connect() called with StdioServerTransport
  - Logs startup message

**Test:** `stopServer() disconnects all clients and closes server`
- **Setup:**
  - Mock Server, httpServer
  - mcpClients Map with 2 clients
- **Action:** Call `stopServer(server, mcpClients, httpServer)`
- **Assertions:**
  - Both clients had disconnect() called
  - httpServer.shutdown() called
  - server.close() called

**Test:** `stopServer() handles client disconnect errors gracefully`
- **Setup:** One client throws on disconnect
- **Action:** Call `stopServer()`
- **Assertions:**
  - Other clients still disconnected
  - Error logged
  - server.close() still called

**Test:** `stopServer() handles null httpServer`
- **Setup:** httpServer = null
- **Action:** Call `stopServer()`
- **Assertion:** No error thrown

---

### 4.2 Health (`tests/unit/mcp/server/health.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/server/health.ts`

#### Test Cases

**Test:** `getHealthStatus() returns ok status with timestamp`
- **Action:** Call `getHealthStatus()`
- **Assertions:**
  - Returns { status: 'ok', timestamp: ISO string }
  - timestamp is recent (within 1 second)

**Test:** `handleHealth() returns health status as JSON`
- **Action:** Call `handleHealth(req, url, corsHeaders)`
- **Assertions:**
  - Status = 200
  - Body contains status='ok'
  - CORS headers present

**Test:** `handleEventsStream() returns SSE response when stream exists`
- **Setup:** Mock eventsStream.handleRequest()
- **Action:** Call `handleEventsStream()`
- **Assertion:** Returns SSE response

**Test:** `handleEventsStream() returns 503 when stream is null`
- **Setup:** eventsStream = null
- **Action:** Call `handleEventsStream()`
- **Assertion:** Status = 503

**Test:** `handleDashboardRedirect() returns 302 with Location header`
- **Action:** Call `handleDashboardRedirect()`
- **Assertions:**
  - Status = 302
  - Location = 'http://localhost:8080/dashboard'

---

## 5. Response Formatting Tests

### 5.1 Formatter (`tests/unit/mcp/responses/formatter.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/responses/formatter.ts`

#### Test Cases

##### 5.1.1 MCP Success Formatting

**Test:** `formatMCPSuccess() wraps data in MCP text content`
- **Setup:** data = { result: 'test' }
- **Action:** Call `formatMCPSuccess(data)`
- **Assertions:**
  - Returns { content: [{ type: 'text', text: string }] }
  - text is JSON.stringify(data, null, 2)

**Test:** `formatMCPSuccess() handles complex nested objects`
- **Setup:** data with arrays, nested objects, nulls
- **Action:** Call `formatMCPSuccess(data)`
- **Assertion:** text is valid formatted JSON

##### 5.1.2 Layer Complete Formatting

**Test:** `formatLayerComplete() returns correct status structure`
- **Setup:** workflowId, checkpointId, layerIndex, etc.
- **Action:** Call `formatLayerComplete(...)`
- **Assertions:**
  - status = 'layer_complete'
  - workflow_id, checkpoint_id set correctly
  - layer_index, total_layers set
  - layer_results array included
  - next_layer_preview present when hasNextLayer=true
  - options = ['continue', 'replan', 'abort']

**Test:** `formatLayerComplete() omits next_layer_preview when hasNextLayer=false`
- **Setup:** hasNextLayer=false
- **Action:** Call `formatLayerComplete(...)`
- **Assertion:** next_layer_preview = null

##### 5.1.3 Workflow Complete Formatting

**Test:** `formatWorkflowComplete() returns complete status`
- **Action:** Call `formatWorkflowComplete(workflowId, totalTimeMs, successCount, failCount, results)`
- **Assertions:**
  - status = 'complete'
  - All parameters mapped correctly

##### 5.1.4 Approval Required Formatting

**Test:** `formatApprovalRequired() returns approval_required status`
- **Action:** Call `formatApprovalRequired(...)`
- **Assertions:**
  - status = 'approval_required'
  - options = ['approve', 'reject']
  - Contains checkpoint_id, decision_type, description, context

##### 5.1.5 Abort Confirmation

**Test:** `formatAbortConfirmation() returns aborted status`
- **Action:** Call `formatAbortConfirmation(workflowId, reason, completedLayers, partialResults)`
- **Assertions:**
  - status = 'aborted'
  - reason, completed_layers, partial_results included

##### 5.1.6 Rejection Confirmation

**Test:** `formatRejectionConfirmation() returns rejected status`
- **Action:** Call `formatRejectionConfirmation(...)`
- **Assertions:**
  - status = 'rejected'
  - checkpoint_id, feedback, completed_layers included

##### 5.1.7 Replan Confirmation

**Test:** `formatReplanConfirmation() returns replanned status`
- **Action:** Call `formatReplanConfirmation(...)`
- **Assertions:**
  - status = 'replanned'
  - new_requirement, new_tasks_count, new_task_ids, total_tasks included
  - options = ['continue', 'abort']

---

### 5.2 Errors (`tests/unit/mcp/responses/errors.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/responses/errors.ts`

#### Test Cases

**Test:** `formatMCPError() creates error response with code and message`
- **Setup:** code=-32600, message='Invalid Request'
- **Action:** Call `formatMCPError(code, message)`
- **Assertions:**
  - Returns { error: { code, message } }
  - No data field

**Test:** `formatMCPError() includes optional data field`
- **Setup:** code, message, data={ detail: 'extra' }
- **Action:** Call `formatMCPError(code, message, data)`
- **Assertion:** error.data equals { detail: 'extra' }

**Test:** `invalidParamsError() uses code -32602`
- **Action:** Call `invalidParamsError('Missing param')`
- **Assertions:**
  - error.code = -32602
  - error.message = 'Missing param'

**Test:** `internalError() uses code -32603`
- **Action:** Call `internalError('Server error')`
- **Assertion:** error.code = -32603

**Test:** `methodNotFoundError() uses code -32601`
- **Action:** Call `methodNotFoundError('unknown_method')`
- **Assertions:**
  - error.code = -32601
  - error.message includes 'unknown_method'

**Test:** `parseError() uses code -32700`
- **Action:** Call `parseError('Invalid JSON')`
- **Assertion:** error.code = -32700

---

## 6. Metrics Tests

### 6.1 MetricsCollector (`tests/unit/mcp/metrics/collector.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/metrics/collector.ts`

#### Test Cases

**Test:** `getMetrics() returns metrics from graphEngine`
- **Setup:** Mock graphEngine.getMetrics() returns test data
- **Action:** Call `collector.getMetrics('24h')`
- **Assertions:**
  - Returns { range: '24h', timestamp: ISO string, data: ... }
  - graphEngine.getMetrics() called with '24h'

**Test:** `getMetrics() handles '1h' range`
- **Action:** Call `collector.getMetrics('1h')`
- **Assertion:** range='1h' in response

**Test:** `getMetrics() handles '7d' range`
- **Action:** Call `collector.getMetrics('7d')`
- **Assertion:** range='7d' in response

**Test:** `getMetrics() returns empty data when graphEngine is undefined`
- **Setup:** MetricsCollector without graphEngine
- **Action:** Call `getMetrics('24h')`
- **Assertions:**
  - Returns { range, timestamp, data: {} }
  - No error thrown

**Test:** `getMetrics() propagates graphEngine errors`
- **Setup:** Mock getMetrics() throws Error
- **Action:** Call `collector.getMetrics('24h')`
- **Assertion:** Error propagates

**Test:** `setGraphEngine() updates graphEngine reference`
- **Setup:** Collector without engine
- **Action:** Call `setGraphEngine(mockEngine)`, then `getMetrics()`
- **Assertion:** mockEngine.getMetrics() is called

**Test:** `handleMetrics() returns metrics via HTTP handler`
- **Setup:** Mock graphEngine
- **Action:** Call `handleMetrics(req, url, graphEngine, corsHeaders)`
- **Assertions:**
  - Status = 200
  - Body contains metrics data

**Test:** `handleMetrics() validates range parameter`
- **Setup:** URL with ?range=invalid
- **Action:** Call `handleMetrics()`
- **Assertion:** Status = 400

---

## 7. Registry Tests

### 7.1 ToolRegistry (`tests/unit/mcp/registry/tool-registry.test.ts`)

**Module:** `/home/ubuntu/CascadeProjects/AgentCards/src/mcp/registry/tool-registry.ts`

#### Test Cases

##### 7.1.1 Tool Registration

**Test:** `constructor registers default meta-tools`
- **Setup:** Create new ToolRegistry()
- **Action:** Check registry contents
- **Assertions:**
  - Contains 'execute_dag'
  - Contains 'search_tools'
  - Contains 'search_capabilities'
  - Contains 'execute_code'
  - Contains 'continue', 'abort', 'replan'
  - Contains 'approval_response'
  - Total count = 8

**Test:** `register() adds tool to registry`
- **Setup:** Create ToolRegistry, define custom tool
- **Action:** Call `registry.register(customTool)`
- **Assertions:**
  - get(customTool.name) returns customTool
  - has(customTool.name) returns true

**Test:** `register() overwrites existing tool with same name`
- **Setup:** Register tool1 with name='test', then tool2 with name='test'
- **Action:** get('test')
- **Assertion:** Returns tool2, not tool1

##### 7.1.2 Tool Retrieval

**Test:** `get() returns undefined for non-existent tool`
- **Action:** registry.get('nonexistent')
- **Assertion:** Returns undefined

**Test:** `has() returns false for non-existent tool`
- **Action:** registry.has('nonexistent')
- **Assertion:** Returns false

**Test:** `getNames() returns all registered tool names`
- **Setup:** Registry with default tools
- **Action:** registry.getNames()
- **Assertion:** Returns array of 8 tool names

**Test:** `getAll() returns all tools as array`
- **Action:** registry.getAll()
- **Assertions:**
  - Returns array of MCPTool objects
  - Length = 8 (default tools)

##### 7.1.3 MCP Response Formatting

**Test:** `getMetaTools() returns tools in MCP format`
- **Action:** registry.getMetaTools()
- **Assertions:**
  - Returns array of { name, description, inputSchema }
  - Each tool has all required fields
  - No extraneous fields

**Test:** `getMetaTools() includes inputSchema for each tool`
- **Action:** registry.getMetaTools()
- **Assertion:** Each tool has inputSchema object

##### 7.1.4 Search Functionality

**Test:** `search() finds tools by name (case-insensitive)`
- **Setup:** Registry with default tools
- **Action:** registry.search('DAG')
- **Assertion:** Returns tools with 'dag' in name (e.g., 'execute_dag')

**Test:** `search() finds tools by description`
- **Setup:** Registry with tools
- **Action:** registry.search('capabilities')
- **Assertion:** Returns 'search_capabilities' tool

**Test:** `search() returns empty array for no matches`
- **Action:** registry.search('zzzzzzz')
- **Assertion:** Returns []

**Test:** `search() is case-insensitive`
- **Action:** registry.search('EXECUTE')
- **Assertion:** Finds tools with 'execute' in name/description

##### 7.1.5 Default Registry Instance

**Test:** `defaultRegistry is singleton instance`
- **Action:** Import defaultRegistry twice
- **Assertion:** Same instance (reference equality)

**Test:** `getMetaTools() convenience function uses defaultRegistry`
- **Action:** Call `getMetaTools()` (exported function)
- **Assertion:** Returns same as `defaultRegistry.getMetaTools()`

---

## 8. Cross-Cutting Concerns

### 8.1 Error Handling Patterns

All handlers should be tested for:
- Propagation of sync errors
- Propagation of async errors (rejected Promises)
- Logging of errors before returning error responses
- Consistent error response format (JSON with 'error' field)
- Appropriate HTTP status codes (400, 500, 503, etc.)

### 8.2 CORS Header Consistency

All HTTP handlers should be tested for:
- CORS headers included in success responses
- CORS headers included in error responses
- OPTIONS preflight handling

### 8.3 Type Safety

Test edge cases:
- null/undefined parameters
- Invalid type parameters (string instead of number, etc.)
- Missing required fields in request bodies
- Extra unexpected fields in request bodies

### 8.4 Concurrency Safety

Test concurrent operations:
- Multiple simultaneous requests to same endpoint
- Concurrent pool operations
- Race conditions in connection management
- Timer cleanup during concurrent operations

---

## 9. Test Utilities and Mocking

### 9.1 Mock Factories

Create reusable mock factories for:

**MockMCPClient:**
```typescript
function createMockMCPClient(): MCPClientBase {
  return {
    disconnect: spy(async () => {}),
    // ... other methods
  };
}
```

**MockGraphEngine:**
```typescript
function createMockGraphEngine(): Partial<GraphRAGEngine> {
  return {
    getGraphSnapshot: spy(() => ({ nodes: [], edges: [] })),
    findShortestPath: spy(() => []),
    computeAdamicAdar: spy(() => []),
    getMetrics: spy(async () => ({ data: {} })),
    // ...
  };
}
```

**MockRouteContext:**
```typescript
function createMockRouteContext(): RouteContext {
  return {
    graphEngine: createMockGraphEngine(),
    vectorSearch: createMockVectorSearch(),
    // ... all required fields
  };
}
```

### 9.2 Test Helpers

**Request Builder:**
```typescript
function createTestRequest(
  method: string,
  url: string,
  body?: unknown
): Request {
  return new Request(`http://test.com${url}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
  });
}
```

**Response Assertions:**
```typescript
async function assertJsonResponse(
  response: Response,
  status: number,
  bodyMatcher: (body: unknown) => void
): Promise<void> {
  assertEquals(response.status, status);
  const body = await response.json();
  bodyMatcher(body);
}
```

---

## 10. Coverage Goals

### Target Coverage Metrics

- **Line Coverage:** > 90%
- **Branch Coverage:** > 85%
- **Function Coverage:** 100%

### Priority Modules (Must achieve 95%+ coverage)

1. `connections/manager.ts` - Critical for connection lifecycle
2. `connections/pool.ts` - Complex timer and pooling logic
3. `routing/dispatcher.ts` - Core request routing
4. `routing/middleware.ts` - Security-critical CORS/auth logic
5. `responses/errors.ts` - Error handling consistency

### Secondary Modules (Target 85%+ coverage)

- All HTTP handlers (graph, capabilities, metrics, tools, health)
- Response formatters
- Tool registry

---

## 11. Test Execution Strategy

### 11.1 Local Development

Run unit tests in isolation:
```bash
deno test tests/unit/mcp/connections/ --allow-env --allow-net=localhost
deno test tests/unit/mcp/routing/ --allow-env --allow-net=localhost
deno test tests/unit/mcp/server/ --allow-env --allow-net=localhost
```

### 11.2 CI/CD Pipeline

Run all unit tests with coverage:
```bash
deno test tests/unit/mcp/ --coverage=coverage --allow-env --allow-net=localhost
deno coverage coverage --lcov > coverage.lcov
```

### 11.3 Watch Mode

For TDD workflow:
```bash
deno test tests/unit/mcp/ --watch --allow-env --allow-net=localhost
```

---

## 12. Known Gaps and Future Work

### 12.1 Integration Tests

Unit tests in this plan focus on isolated module testing. Integration tests are needed for:
- Full request flow: middleware → router → handler → response
- Connection pool integration with real MCP clients
- SSE event stream handling
- HTTP server lifecycle

### 12.2 Performance Tests

Not covered in unit tests:
- Connection pool under load (100+ concurrent connections)
- Request dispatcher with 100+ routes
- Large response payload handling

### 12.3 Security Tests

Dedicated security testing needed for:
- CORS origin validation edge cases
- API key authentication bypass attempts
- Path traversal in route patterns
- Request body size limits

---

## 13. Test Plan Summary

### Total Test Cases: ~250

| Module | Test Cases | Priority |
|--------|-----------|----------|
| ConnectionManager | 20 | HIGH |
| ConnectionPool | 25 | HIGH |
| RequestDispatcher | 30 | HIGH |
| Router | 15 | MEDIUM |
| Middleware | 15 | HIGH |
| Graph Handlers | 35 | MEDIUM |
| Capabilities Handlers | 40 | MEDIUM |
| Metrics Handler | 10 | LOW |
| Tools Handler | 10 | LOW |
| Health Handler | 10 | LOW |
| Lifecycle | 8 | MEDIUM |
| Server Health | 6 | LOW |
| Response Formatter | 12 | MEDIUM |
| Response Errors | 8 | MEDIUM |
| MetricsCollector | 10 | MEDIUM |
| ToolRegistry | 16 | MEDIUM |

### Estimated Effort

- Test implementation: 16-20 hours
- Mock setup and utilities: 4-6 hours
- Coverage analysis and gap filling: 4-6 hours
- **Total:** 24-32 hours

### Success Criteria

1. All 250+ test cases pass
2. Line coverage > 90%
3. Branch coverage > 85%
4. No flaky tests (100 consecutive runs pass)
5. Test execution time < 30 seconds
6. Zero race conditions detected in concurrency tests

---

## Appendix A: File Paths Reference

All test files will be created under:
```
/home/ubuntu/CascadeProjects/AgentCards/tests/unit/mcp/
```

All source files under test:
```
/home/ubuntu/CascadeProjects/AgentCards/src/mcp/
```

---

## Appendix B: Testing Standards

### Naming Conventions

- Test files: `<module-name>.test.ts`
- Test suites: `Deno.test("<ModuleName> - <feature>", async (t) => { ... })`
- Test steps: `await t.step("<test description>", () => { ... })`

### Assertion Style

Use Deno standard assertions:
```typescript
import { assertEquals, assertThrows, assertRejects } from "jsr:@std/assert@1";
```

### Mock/Spy Style

Use Deno standard mocking:
```typescript
import { spy, stub } from "jsr:@std/testing/mock";
```

### Test Isolation

- Each test should be independent (no shared state)
- Use `t.step()` for grouping related assertions
- Clean up resources (timers, connections) in test teardown
- Use `sanitizeOps: false` and `sanitizeResources: false` only when necessary

---

**End of Test Plan**
