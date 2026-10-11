import type { DatabaseSync } from 'node:sqlite'
import { transaction, WorkflowStoreError } from './sqlite.ts'

export function initializeSchema(db: DatabaseSync): void {
  transaction(db, () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
    if (tables.length > 0) {
      const metadataExists = tables.some((table) => table['name'] === 'metadata')
      const versions = metadataExists ? db.prepare('SELECT version FROM metadata').all() : []
      if (versions.length !== 1 || versions[0]?.['version'] !== 1 || !tables.some((table) => table['name'] === 'lease_claims')) {
        throw new WorkflowStoreError('BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED', 'Unsupported workflow storage schema')
      }
      return
    }
    db.exec(`
      CREATE TABLE metadata (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL);
      INSERT INTO metadata VALUES (1, 1);
      CREATE TABLE runs (
        namespace TEXT NOT NULL, run_id TEXT NOT NULL, revision INTEGER NOT NULL,
        snapshot TEXT NOT NULL, PRIMARY KEY (namespace, run_id)
      );
      CREATE TABLE receipts (
        ordinal INTEGER PRIMARY KEY AUTOINCREMENT, namespace TEXT NOT NULL, id TEXT NOT NULL,
        client_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, run_id TEXT NOT NULL,
        phase TEXT NOT NULL, receipt TEXT NOT NULL,
        UNIQUE (namespace, id), UNIQUE (namespace, client_id, idempotency_key),
        FOREIGN KEY (namespace, run_id) REFERENCES runs (namespace, run_id)
      );
      CREATE TABLE events (
        namespace TEXT NOT NULL, run_id TEXT NOT NULL, cursor INTEGER NOT NULL, event TEXT NOT NULL,
        PRIMARY KEY (namespace, run_id, cursor),
        FOREIGN KEY (namespace, run_id) REFERENCES runs (namespace, run_id)
      );
      CREATE TABLE resource_epochs (
        namespace TEXT NOT NULL, resource TEXT NOT NULL, epoch INTEGER NOT NULL,
        owner_id TEXT, token_hash TEXT, expires_at INTEGER,
        PRIMARY KEY (namespace, resource)
      );
      CREATE TABLE lease_claims (
        namespace TEXT NOT NULL, token_hash TEXT NOT NULL, owner_id TEXT NOT NULL,
        resources TEXT NOT NULL, PRIMARY KEY (namespace, token_hash)
      );
      CREATE INDEX pending_receipts ON receipts(namespace, phase, ordinal);
    `)
  })
}
