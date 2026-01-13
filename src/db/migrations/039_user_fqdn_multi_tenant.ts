/**
 * Migration 039: User FQDN Multi-Tenant
 *
 * Converts TEXT user_id/created_by columns to UUID FK to users table.
 * Enables multi-tenant FQDN pattern: {username}.{project}.{namespace}.{action}
 *
 * Tables affected:
 * - capability_records: Add user_id UUID FK, drop created_by/updated_by
 * - workflow_pattern: Convert created_by TEXT to user_id UUID FK
 * - execution_trace: Convert user_id TEXT to UUID FK, drop created_by/updated_by
 * - workflow_execution: Convert user_id TEXT to UUID FK, drop created_by/updated_by
 * - algorithm_traces: Convert user_id TEXT to UUID FK
 * - entropy_history: Convert user_id TEXT to UUID FK
 * - shgat_params: Remove user_id column (global model, not per-user)
 *
 * @module db/migrations/039_user_fqdn_multi_tenant
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

const MIGRATION_NAME = "039_user_fqdn_multi_tenant";

/**
 * Regex pattern for UUID validation (PostgreSQL syntax)
 */
const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

/**
 * Check if the users table exists (for FK constraints)
 */
async function usersTableExists(db: DbClient): Promise<boolean> {
  try {
    const result = await db.queryOne(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'users';
    `);
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Check if database supports regex operator (PGlite doesn't)
 */
async function supportsRegex(db: DbClient): Promise<boolean> {
  try {
    await db.queryOne(`SELECT 'test' ~ 'test' as result`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Step 0: Cleanup orphaned UUIDs that reference deleted users
 *
 * Note: This step is skipped for PGlite (no regex support, no users table)
 */
async function cleanupOrphanedUuids(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Step 0: Cleaning up orphaned UUIDs...`);

  // Skip for PGlite - no users table and no regex support
  const hasUsers = await usersTableExists(db);
  const hasRegex = await supportsRegex(db);

  if (!hasUsers || !hasRegex) {
    log.info(`  ○ Skipping orphan cleanup (PGlite mode or no users table)`);
    return;
  }

  const tables = [
    "execution_trace",
    "algorithm_traces",
    "entropy_history",
    "workflow_execution",
    // Note: shgat_params is excluded - we're removing user_id entirely (global model)
  ];

  for (const table of tables) {
    try {
      // Check if table exists and has user_id column
      const hasColumn = await db.queryOne(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = '${table}' AND column_name = 'user_id';
      `);

      if (!hasColumn) {
        log.debug(`  ○ Table ${table} has no user_id column, skipping`);
        continue;
      }

      // Null out orphaned UUIDs (only with regex support)
      await db.exec(`
        UPDATE ${table}
        SET user_id = NULL
        WHERE user_id IS NOT NULL
          AND user_id ~ '${UUID_PATTERN}'
          AND user_id::uuid NOT IN (SELECT id FROM users);
      `);

      log.debug(`  ✓ Cleaned orphaned UUIDs in ${table}`);
    } catch (error) {
      log.warn(`  ⚠ Could not clean ${table}: ${error}`);
    }
  }

  log.info(`  ✓ Step 0 complete: Orphaned UUIDs cleaned`);
}

/**
 * Step 1: capability_records - Add user_id FK, drop created_by/updated_by
 */
async function migrateCapabilityRecords(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Step 1: Migrating capability_records...`);

  const hasUsers = await usersTableExists(db);
  const hasRegex = await supportsRegex(db);

  // Check if user_id already exists
  const hasUserId = await db.queryOne(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'capability_records' AND column_name = 'user_id';
  `);

  if (!hasUserId) {
    // Add user_id column (with or without FK depending on users table)
    if (hasUsers) {
      await db.exec(`
        ALTER TABLE capability_records
        ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
      `);
    } else {
      await db.exec(`
        ALTER TABLE capability_records
        ADD COLUMN user_id UUID;
      `);
    }
    log.debug(`  ✓ Added user_id column`);

    // Migrate from created_by if it contains valid UUIDs (only with regex support)
    if (hasRegex) {
      try {
        await db.exec(`
          UPDATE capability_records
          SET user_id = created_by::uuid
          WHERE created_by ~ '${UUID_PATTERN}';
        `);
        log.debug(`  ✓ Migrated data from created_by`);
      } catch (e) {
        log.debug(`  ○ Could not migrate created_by data: ${e}`);
      }
    }

    // Create index
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_capability_records_user ON capability_records(user_id);
    `);
    log.debug(`  ✓ Created index`);
  } else {
    log.debug(`  ○ user_id column already exists`);
  }

  // Drop old columns if they exist
  const hasCreatedBy = await db.queryOne(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'capability_records' AND column_name = 'created_by';
  `);

  if (hasCreatedBy) {
    try {
      await db.exec(`ALTER TABLE capability_records DROP COLUMN IF EXISTS created_by`);
      await db.exec(`ALTER TABLE capability_records DROP COLUMN IF EXISTS updated_by`);
      log.debug(`  ✓ Dropped created_by and updated_by columns`);
    } catch (e) {
      log.warn(`  ⚠ Could not drop old columns: ${e}`);
    }
  }

  log.info(`  ✓ Step 1 complete: capability_records migrated`);
}

/**
 * Step 2: workflow_pattern - Convert created_by to user_id FK
 */
async function migrateWorkflowPattern(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Step 2: Migrating workflow_pattern...`);

  const hasUsers = await usersTableExists(db);
  const hasRegex = await supportsRegex(db);

  // Check if user_id already exists
  const hasUserId = await db.queryOne(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_pattern' AND column_name = 'user_id';
  `);

  if (!hasUserId) {
    // Add user_id column (with or without FK)
    if (hasUsers) {
      await db.exec(`
        ALTER TABLE workflow_pattern
        ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
      `);
    } else {
      await db.exec(`
        ALTER TABLE workflow_pattern
        ADD COLUMN user_id UUID;
      `);
    }
    log.debug(`  ✓ Added user_id column`);

    // Migrate from created_by (only with regex support)
    if (hasRegex) {
      try {
        await db.exec(`
          UPDATE workflow_pattern
          SET user_id = created_by::uuid
          WHERE created_by ~ '${UUID_PATTERN}';
        `);
        log.debug(`  ✓ Migrated data from created_by`);
      } catch (e) {
        log.debug(`  ○ Could not migrate created_by data: ${e}`);
      }
    }

    // Create index
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_workflow_pattern_user ON workflow_pattern(user_id);
    `);
    log.debug(`  ✓ Created index`);
  } else {
    log.debug(`  ○ user_id column already exists`);
  }

  // Drop created_by if it exists
  const hasCreatedBy = await db.queryOne(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_pattern' AND column_name = 'created_by';
  `);

  if (hasCreatedBy) {
    // Drop index first
    await db.exec(`DROP INDEX IF EXISTS idx_workflow_pattern_created_by`);

    // Use CASCADE directly to handle any dependent objects (views, etc.)
    // Note: This may drop the pml_registry view, which will be recreated
    // by migration 035 if it was already applied, or by next app start
    await db.exec(`ALTER TABLE workflow_pattern DROP COLUMN IF EXISTS created_by CASCADE`);
    log.debug(`  ✓ Dropped created_by column`);
  }

  log.info(`  ✓ Step 2 complete: workflow_pattern migrated`);
}

/**
 * Step 3: execution_trace - Convert user_id TEXT to UUID FK
 */
async function migrateExecutionTrace(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Step 3: Migrating execution_trace...`);

  const hasUsers = await usersTableExists(db);
  const hasRegex = await supportsRegex(db);

  // Check current user_id column type
  const columnInfo = await db.queryOne(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'execution_trace' AND column_name = 'user_id';
  `);

  if (columnInfo?.data_type === "text") {
    // Drop old audit columns
    try {
      await db.exec(`ALTER TABLE execution_trace DROP COLUMN IF EXISTS created_by`);
      await db.exec(`ALTER TABLE execution_trace DROP COLUMN IF EXISTS updated_by`);
      log.debug(`  ✓ Dropped created_by and updated_by`);
    } catch (e) {
      log.debug(`  ○ Could not drop audit columns: ${e}`);
    }

    // Add new UUID column
    await db.exec(`ALTER TABLE execution_trace ADD COLUMN user_id_new UUID`);

    // Migrate valid UUIDs (only with regex support)
    if (hasRegex) {
      try {
        await db.exec(`
          UPDATE execution_trace
          SET user_id_new = user_id::uuid
          WHERE user_id ~ '${UUID_PATTERN}';
        `);
        log.debug(`  ✓ Migrated UUID values`);
      } catch (e) {
        log.debug(`  ○ Could not migrate UUID values: ${e}`);
      }
    }

    // Swap columns
    await db.exec(`ALTER TABLE execution_trace DROP COLUMN user_id`);
    await db.exec(`ALTER TABLE execution_trace RENAME COLUMN user_id_new TO user_id`);

    // Add FK (only if users table exists) and index
    if (hasUsers) {
      try {
        await db.exec(`
          ALTER TABLE execution_trace
          ADD CONSTRAINT fk_execution_trace_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        `);
        log.debug(`  ✓ Added FK`);
      } catch (e) {
        log.debug(`  ○ Could not add FK: ${e}`);
      }
    }

    await db.exec(`CREATE INDEX IF NOT EXISTS idx_exec_trace_user_new ON execution_trace(user_id)`);
    log.debug(`  ✓ Created index`);
  } else {
    log.debug(`  ○ user_id already UUID type`);
  }

  log.info(`  ✓ Step 3 complete: execution_trace migrated`);
}

/**
 * Step 4: workflow_execution - Convert user_id TEXT to UUID FK
 */
async function migrateWorkflowExecution(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Step 4: Migrating workflow_execution...`);

  const hasUsers = await usersTableExists(db);
  const hasRegex = await supportsRegex(db);

  // Check if table exists
  const tableExists = await db.queryOne(`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_execution';
  `);

  if (!tableExists) {
    log.debug(`  ○ Table workflow_execution does not exist, skipping`);
    return;
  }

  // Check current user_id column type
  const columnInfo = await db.queryOne(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'workflow_execution' AND column_name = 'user_id';
  `);

  if (columnInfo?.data_type === "text") {
    // Drop old audit columns
    try {
      await db.exec(`ALTER TABLE workflow_execution DROP COLUMN IF EXISTS created_by`);
      await db.exec(`ALTER TABLE workflow_execution DROP COLUMN IF EXISTS updated_by`);
    } catch (e) {
      log.debug(`  ○ Could not drop audit columns: ${e}`);
    }

    // Add new UUID column
    await db.exec(`ALTER TABLE workflow_execution ADD COLUMN user_id_new UUID`);

    // Migrate valid UUIDs (only with regex support)
    if (hasRegex) {
      try {
        await db.exec(`
          UPDATE workflow_execution
          SET user_id_new = user_id::uuid
          WHERE user_id IS NOT NULL AND user_id ~ '${UUID_PATTERN}';
        `);
      } catch (e) {
        log.debug(`  ○ Could not migrate UUIDs: ${e}`);
      }
    }

    // Swap columns
    await db.exec(`ALTER TABLE workflow_execution DROP COLUMN user_id`);
    await db.exec(`ALTER TABLE workflow_execution RENAME COLUMN user_id_new TO user_id`);

    // Add FK (only if users table exists)
    if (hasUsers) {
      try {
        await db.exec(`
          ALTER TABLE workflow_execution
          ADD CONSTRAINT fk_workflow_execution_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        `);
      } catch (e) {
        log.debug(`  ○ Could not add FK: ${e}`);
      }
    }

    await db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_execution_user ON workflow_execution(user_id)`);
    log.debug(`  ✓ Converted user_id to UUID`);
  } else {
    log.debug(`  ○ user_id already UUID type or missing`);
  }

  log.info(`  ✓ Step 4 complete: workflow_execution migrated`);
}

/**
 * Step 5: algorithm_traces - Convert user_id TEXT to UUID FK
 */
async function migrateAlgorithmTraces(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Step 5: Migrating algorithm_traces...`);

  const hasUsers = await usersTableExists(db);
  const hasRegex = await supportsRegex(db);

  const columnInfo = await db.queryOne(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'algorithm_traces' AND column_name = 'user_id';
  `);

  if (columnInfo?.data_type === "text") {
    await db.exec(`ALTER TABLE algorithm_traces ADD COLUMN user_id_new UUID`);

    if (hasRegex) {
      try {
        await db.exec(`
          UPDATE algorithm_traces
          SET user_id_new = user_id::uuid
          WHERE user_id ~ '${UUID_PATTERN}';
        `);
      } catch (e) {
        log.debug(`  ○ Could not migrate UUIDs: ${e}`);
      }
    }

    await db.exec(`ALTER TABLE algorithm_traces DROP COLUMN user_id`);
    await db.exec(`ALTER TABLE algorithm_traces RENAME COLUMN user_id_new TO user_id`);

    if (hasUsers) {
      try {
        await db.exec(`
          ALTER TABLE algorithm_traces
          ADD CONSTRAINT fk_algorithm_traces_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        `);
      } catch (e) {
        log.debug(`  ○ Could not add FK: ${e}`);
      }
    }

    await db.exec(`CREATE INDEX IF NOT EXISTS idx_algorithm_traces_user ON algorithm_traces(user_id)`);
    log.debug(`  ✓ Converted user_id to UUID`);
  } else {
    log.debug(`  ○ user_id already UUID type`);
  }

  log.info(`  ✓ Step 5 complete: algorithm_traces migrated`);
}

/**
 * Step 6: entropy_history - Convert user_id TEXT to UUID FK
 */
async function migrateEntropyHistory(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Step 6: Migrating entropy_history...`);

  const hasUsers = await usersTableExists(db);
  const hasRegex = await supportsRegex(db);

  const columnInfo = await db.queryOne(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'entropy_history' AND column_name = 'user_id';
  `);

  if (columnInfo?.data_type === "text") {
    await db.exec(`ALTER TABLE entropy_history ADD COLUMN user_id_new UUID`);

    if (hasRegex) {
      try {
        await db.exec(`
          UPDATE entropy_history
          SET user_id_new = user_id::uuid
          WHERE user_id ~ '${UUID_PATTERN}';
        `);
      } catch (e) {
        log.debug(`  ○ Could not migrate UUIDs: ${e}`);
      }
    }

    await db.exec(`ALTER TABLE entropy_history DROP COLUMN user_id`);
    await db.exec(`ALTER TABLE entropy_history RENAME COLUMN user_id_new TO user_id`);

    if (hasUsers) {
      try {
        await db.exec(`
          ALTER TABLE entropy_history
          ADD CONSTRAINT fk_entropy_history_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        `);
      } catch (e) {
        log.debug(`  ○ Could not add FK: ${e}`);
      }
    }

    // Re-create the user-time index with new column
    try {
      await db.exec(`DROP INDEX IF EXISTS idx_entropy_history_user_time`);
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_entropy_history_user_time
        ON entropy_history(user_id, recorded_at DESC)
        WHERE user_id IS NOT NULL
      `);
    } catch (e) {
      log.debug(`  ○ Could not recreate index: ${e}`);
    }
    log.debug(`  ✓ Converted user_id to UUID`);
  } else {
    log.debug(`  ○ user_id already UUID type`);
  }

  log.info(`  ✓ Step 6 complete: entropy_history migrated`);
}

/**
 * Step 7: shgat_params - Remove user_id column (global model, not per-user)
 *
 * SHGAT weights are trained on ALL users' traces, not per-user.
 * The user_id column was a design mistake - there should only be one global model.
 */
async function migrateSHGATParams(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Step 7: Removing user_id from shgat_params (global model)...`);

  const hasColumn = await db.queryOne(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shgat_params' AND column_name = 'user_id';
  `);

  if (hasColumn) {
    // Drop unique constraint first (try/catch for PGlite compatibility)
    try {
      await db.exec(`ALTER TABLE shgat_params DROP CONSTRAINT IF EXISTS shgat_params_user_id_key`);
    } catch (e) {
      log.debug(`  ○ Could not drop constraint: ${e}`);
    }

    // Drop index if exists
    try {
      await db.exec(`DROP INDEX IF EXISTS idx_shgat_params_user_id`);
    } catch (e) {
      log.debug(`  ○ Could not drop index: ${e}`);
    }

    // Drop the column - keep only one row (the global model)
    // First, keep only the most recent row if multiple exist
    try {
      await db.exec(`
        DELETE FROM shgat_params
        WHERE id NOT IN (
          SELECT id FROM shgat_params ORDER BY updated_at DESC LIMIT 1
        )
      `);
    } catch (e) {
      log.debug(`  ○ Could not clean duplicate rows: ${e}`);
    }

    // Now drop the column
    try {
      await db.exec(`ALTER TABLE shgat_params DROP COLUMN user_id`);
      log.debug(`  ✓ Removed user_id column from shgat_params`);
    } catch (e) {
      log.warn(`  ⚠ Could not drop user_id column: ${e}`);
    }
  } else {
    log.debug(`  ○ user_id column already removed`);
  }

  log.info(`  ✓ Step 7 complete: shgat_params is now global`);
}

/**
 * Step 8: Recreate pml_registry VIEW if it was dropped by CASCADE
 *
 * The pml_registry VIEW (from migration 035) may have been dropped
 * when we used CASCADE on workflow_pattern columns. Recreate it.
 */
async function recreatePmlRegistryView(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Step 8: Checking pml_registry VIEW...`);

  // Check if view exists
  const viewExists = await db.queryOne(`
    SELECT 1 FROM information_schema.views WHERE table_name = 'pml_registry';
  `);

  if (!viewExists) {
    // Recreate the view (same as migration 035)
    try {
      await db.exec(`
        CREATE OR REPLACE VIEW pml_registry AS
          -- MCP Tools (from tool_schema)
          SELECT
            'mcp-tool'::text as record_type,
            tool_id as id,
            name,
            description,
            code_url,
            routing,
            server_id,
            NULL::uuid as workflow_pattern_id,
            NULL::text as org,
            NULL::text as project,
            NULL::text as namespace,
            NULL::text as action
          FROM tool_schema

          UNION ALL

          -- Capabilities (from capability_records + workflow_pattern)
          SELECT
            'capability'::text as record_type,
            cr.id::text as id,
            cr.namespace || ':' || cr.action as name,
            wp.description,
            NULL::text as code_url,
            cr.routing,
            NULL::text as server_id,
            cr.workflow_pattern_id,
            cr.org,
            cr.project,
            cr.namespace,
            cr.action
          FROM capability_records cr
          LEFT JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
      `);
      log.debug(`  ✓ Recreated pml_registry VIEW`);
    } catch (e) {
      // View recreation is optional - tool_schema table may not exist
      log.debug(`  ○ Could not recreate pml_registry VIEW: ${e}`);
    }
  } else {
    log.debug(`  ○ pml_registry VIEW already exists`);
  }

  log.info(`  ✓ Step 8 complete: pml_registry VIEW checked`);
}

async function up(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Starting user FQDN multi-tenant migration...`);

  await cleanupOrphanedUuids(db);
  await migrateCapabilityRecords(db);
  await migrateWorkflowPattern(db);
  await migrateExecutionTrace(db);
  await migrateWorkflowExecution(db);
  await migrateAlgorithmTraces(db);
  await migrateEntropyHistory(db);
  await migrateSHGATParams(db);
  await recreatePmlRegistryView(db);

  log.info(`[${MIGRATION_NAME}] ✓ Migration complete`);
}

async function down(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Rolling back user FQDN multi-tenant migration...`);

  // Note: This rollback is DESTRUCTIVE - UUID FKs cannot be perfectly reverted to TEXT
  // The data will be converted back to TEXT with UUID values as strings

  // shgat_params - restore user_id column with 'local' default
  await db.exec(`
    ALTER TABLE shgat_params ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local' UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_shgat_params_user_id ON shgat_params(user_id);
  `);

  // entropy_history
  await db.exec(`
    ALTER TABLE entropy_history DROP CONSTRAINT IF EXISTS fk_entropy_history_user;
    DROP INDEX IF EXISTS idx_entropy_history_user_time;
    ALTER TABLE entropy_history ADD COLUMN user_id_old TEXT;
    UPDATE entropy_history SET user_id_old = user_id::text WHERE user_id IS NOT NULL;
    ALTER TABLE entropy_history DROP COLUMN user_id;
    ALTER TABLE entropy_history RENAME COLUMN user_id_old TO user_id;
  `);

  // algorithm_traces
  await db.exec(`
    ALTER TABLE algorithm_traces DROP CONSTRAINT IF EXISTS fk_algorithm_traces_user;
    DROP INDEX IF EXISTS idx_algorithm_traces_user;
    ALTER TABLE algorithm_traces ADD COLUMN user_id_old TEXT;
    UPDATE algorithm_traces SET user_id_old = user_id::text WHERE user_id IS NOT NULL;
    ALTER TABLE algorithm_traces DROP COLUMN user_id;
    ALTER TABLE algorithm_traces RENAME COLUMN user_id_old TO user_id;
  `);

  // workflow_execution (if exists)
  try {
    await db.exec(`
      ALTER TABLE workflow_execution DROP CONSTRAINT IF EXISTS fk_workflow_execution_user;
      DROP INDEX IF EXISTS idx_workflow_execution_user;
      ALTER TABLE workflow_execution ADD COLUMN user_id_old TEXT;
      UPDATE workflow_execution SET user_id_old = user_id::text WHERE user_id IS NOT NULL;
      ALTER TABLE workflow_execution DROP COLUMN user_id;
      ALTER TABLE workflow_execution RENAME COLUMN user_id_old TO user_id;
    `);
  } catch {
    // Table might not exist
  }

  // execution_trace
  await db.exec(`
    ALTER TABLE execution_trace DROP CONSTRAINT IF EXISTS fk_execution_trace_user;
    DROP INDEX IF EXISTS idx_exec_trace_user_new;
    ALTER TABLE execution_trace ADD COLUMN user_id_old TEXT DEFAULT 'local';
    ALTER TABLE execution_trace ADD COLUMN created_by TEXT DEFAULT 'local';
    ALTER TABLE execution_trace ADD COLUMN updated_by TEXT;
    UPDATE execution_trace SET user_id_old = user_id::text WHERE user_id IS NOT NULL;
    ALTER TABLE execution_trace DROP COLUMN user_id;
    ALTER TABLE execution_trace RENAME COLUMN user_id_old TO user_id;
  `);

  // workflow_pattern
  await db.exec(`
    DROP INDEX IF EXISTS idx_workflow_pattern_user;
    ALTER TABLE workflow_pattern ADD COLUMN created_by TEXT DEFAULT 'local';
    UPDATE workflow_pattern SET created_by = user_id::text WHERE user_id IS NOT NULL;
    ALTER TABLE workflow_pattern DROP COLUMN IF EXISTS user_id;
    CREATE INDEX IF NOT EXISTS idx_workflow_pattern_created_by ON workflow_pattern(created_by);
  `);

  // capability_records
  await db.exec(`
    DROP INDEX IF EXISTS idx_capability_records_user;
    ALTER TABLE capability_records ADD COLUMN created_by TEXT NOT NULL DEFAULT 'local';
    ALTER TABLE capability_records ADD COLUMN updated_by TEXT;
    UPDATE capability_records SET created_by = user_id::text WHERE user_id IS NOT NULL;
    ALTER TABLE capability_records DROP COLUMN IF EXISTS user_id;
  `);

  log.info(`[${MIGRATION_NAME}] ✓ Rollback complete`);
}

export function createUserFqdnMultiTenantMigration(): Migration {
  return {
    version: 39,
    name: MIGRATION_NAME,
    up,
    down,
  };
}
