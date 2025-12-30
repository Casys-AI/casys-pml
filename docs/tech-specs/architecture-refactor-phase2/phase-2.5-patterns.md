# Phase 2.5: Architectural Patterns & Best Practices (P1 - High)

**Parent:** [index.md](./index.md)
**Priority:** P1 - High
**Timeline:** Weeks 9-10
**Depends On:** Phase 2.1-2.4

---

## Objective

Introduce proper design patterns to replace ad-hoc architecture.

---

## Problem: Missing Design Patterns

### Anti-Pattern 1: Constructor Injection Hell

**Current:** `PMLGatewayServer` constructor (10 parameters)

```typescript
constructor(
  private db: DbClient,
  private vectorSearch: VectorSearch,
  private graphEngine: GraphRAGEngine,
  private dagSuggester: DAGSuggester,
  private _executor: ParallelExecutor,
  private mcpClients: Map<string, MCPClientBase>,
  private capabilityStore?: CapabilityStore,
  private adaptiveThresholdManager?: AdaptiveThresholdManager,
  config?: GatewayServerConfig,
  embeddingModel?: EmbeddingModelInterface,
)
```

**Solution:** Builder + Factory Pattern

```typescript
// Gateway Factory
export class GatewayFactory {
  static create(config: GatewayConfig): PMLGatewayServer {
    const container = DIContainer.getInstance();
    return new PMLGatewayServer(
      container.resolve<IVectorSearch>("vector-search"),
      container.resolve<IGraphEngine>("graph-engine"),
      container.resolve<IDAGSuggester>("dag-suggester"),
      config
    );
  }
}

// Gateway Builder (for complex setup)
export class GatewayBuilder {
  private config: Partial<GatewayConfig> = {};

  withSpeculation(enabled: boolean): this {
    this.config.enableSpeculative = enabled;
    return this;
  }

  withPIIProtection(enabled: boolean): this {
    this.config.piiProtection = { enabled };
    return this;
  }

  build(): PMLGatewayServer {
    return GatewayFactory.create(this.config as GatewayConfig);
  }
}

// Usage
const gateway = new GatewayBuilder()
  .withSpeculation(true)
  .withPIIProtection(true)
  .build();
```

---

### Anti-Pattern 2: Service Locator (Map passed everywhere)

**Current:**
```typescript
private mcpClients: Map<string, MCPClientBase>
// Passed to 10+ classes
```

**Solution:** Registry Pattern

```typescript
export interface IMCPClientRegistry {
  getClient(serverId: string): IMCPClient;
  getAllClients(): IMCPClient[];
  register(serverId: string, client: IMCPClient): void;
}

export class MCPClientRegistry implements IMCPClientRegistry {
  private clients = new Map<string, IMCPClient>();

  getClient(serverId: string): IMCPClient {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP client not found: ${serverId}`);
    return client;
  }
  // ...
}
```

---

### Anti-Pattern 3: Business Logic in Handlers

**Solution:** Use Cases (Application Layer)

```typescript
// src/application/use-cases/execute-workflow.ts
export class ExecuteWorkflowUseCase {
  constructor(
    private dagExecutor: IDAGExecutor,
    private workflowRepo: IWorkflowRepository,
    private eventBus: IEventBus
  ) {}

  async execute(request: ExecuteWorkflowRequest): Promise<ExecuteWorkflowResult> {
    // 1. Validate
    const validation = this.validate(request);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 2. Business logic
    const workflow = await this.workflowRepo.findByIntent(request.intent);
    const result = await this.dagExecutor.execute(workflow.dag);

    // 3. Side effects
    await this.eventBus.emit({ type: 'workflow.completed', payload: result });

    return { success: true, data: result };
  }
}

// Handler becomes thin wrapper
export async function handleWorkflowExecution(request: WorkflowExecutionRequest) {
  const useCase = container.get(ExecuteWorkflowUseCase);
  return useCase.execute(request);
}
```

---

### Anti-Pattern 4: Event Bus Under-utilized

**Current:** Only 35 usages, direct coupling instead

**Solution:** Expand Event Bus Usage

```typescript
// src/events/domain-events.ts
export type DomainEvent =
  | { type: 'workflow.started'; payload: { workflowId: string; dag: DAGStructure } }
  | { type: 'workflow.completed'; payload: { workflowId: string; result: DAGExecutionResult } }
  | { type: 'task.started'; payload: { taskId: string; tool: string } }
  | { type: 'task.completed'; payload: { taskId: string; result: TaskResult } }
  | { type: 'capability.learned'; payload: { capabilityId: string; code: string } }
  | { type: 'permission.escalated'; payload: { from: PermissionSet; to: PermissionSet } };

// Replace direct calls with events
// BEFORE:
await this.episodicMemory.capture(event);

// AFTER:
this.eventBus.emit({ type: 'task.completed', payload: event });

// Listener (separate file)
eventBus.on('task.completed', async (event) => {
  await episodicMemory.capture(event);
});
```

---

### Anti-Pattern 5: No State Machine for Workflows

**Solution:** State Machine Pattern

```typescript
export enum WorkflowState {
  CREATED = 'created',
  RUNNING = 'running',
  PAUSED = 'paused',
  AWAITING_APPROVAL = 'awaiting_approval',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABORTED = 'aborted'
}

export class WorkflowStateMachine {
  private static transitions: Record<WorkflowState, WorkflowState[]> = {
    [WorkflowState.CREATED]: [WorkflowState.RUNNING],
    [WorkflowState.RUNNING]: [
      WorkflowState.PAUSED,
      WorkflowState.AWAITING_APPROVAL,
      WorkflowState.COMPLETED,
      WorkflowState.FAILED,
      WorkflowState.ABORTED
    ],
    [WorkflowState.PAUSED]: [WorkflowState.RUNNING, WorkflowState.ABORTED],
    [WorkflowState.AWAITING_APPROVAL]: [WorkflowState.RUNNING, WorkflowState.ABORTED],
    [WorkflowState.COMPLETED]: [],
    [WorkflowState.FAILED]: [],
    [WorkflowState.ABORTED]: []
  };

  constructor(private currentState: WorkflowState) {}

  canTransitionTo(nextState: WorkflowState): boolean {
    return WorkflowStateMachine.transitions[this.currentState].includes(nextState);
  }

  transition(nextState: WorkflowState): void {
    if (!this.canTransitionTo(nextState)) {
      throw new Error(`Invalid transition: ${this.currentState} -> ${nextState}`);
    }
    this.currentState = nextState;
  }
}
```

---

### Anti-Pattern 6: No CQRS Separation

**Solution:** Separate Command and Query Repositories

```typescript
// Write side (Commands)
export interface ICapabilityCommandRepository {
  save(capability: Capability): Promise<void>;
  update(id: string, updates: Partial<Capability>): Promise<void>;
  delete(id: string): Promise<void>;
}

// Read side (Queries)
export interface ICapabilityQueryRepository {
  findById(id: string): Promise<CapabilityReadModel | null>;
  searchByIntent(intent: string): Promise<CapabilityReadModel[]>;
  getStatistics(): Promise<CapabilityStats>;
}
```

---

## Implementation Plan

### Week 9: Design Patterns

**Create:** `src/infrastructure/patterns/`

```
src/infrastructure/patterns/
├── builder/
│   ├── gateway-builder.ts
│   ├── executor-builder.ts
│   └── mod.ts
├── factory/
│   ├── gateway-factory.ts
│   ├── client-factory.ts
│   └── mod.ts
├── registry/
│   ├── mcp-client-registry.ts
│   └── mod.ts
└── lifecycle/
    ├── resource-manager.ts
    └── mod.ts
```

### Week 10: Use Cases Extraction

**Create:** `src/application/use-cases/`

```
src/application/use-cases/
├── workflows/
│   ├── execute-workflow.ts
│   ├── resume-workflow.ts
│   ├── abort-workflow.ts
│   └── replan-workflow.ts
├── capabilities/
│   ├── learn-capability.ts
│   ├── search-capabilities.ts
│   └── execute-capability.ts
└── code/
    ├── execute-code.ts
    └── validate-code.ts
```

---

## Acceptance Criteria

- [ ] Builder pattern for top 3 complex classes
- [ ] Factory pattern for all service creation
- [ ] Registry pattern for MCP clients
- [ ] 15+ use cases extracted
- [ ] Event bus usage increased to 100+ events
- [ ] State machine for workflow states
