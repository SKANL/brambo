import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { Lease } from '@brambodev/contracts'

/** Test fixture only: public acquisition is deliberately unavailable until Task 3. */
export function seedLease(path: string, lease: Lease): void {
  const db = new DatabaseSync(path)
  try {
    const fingerprint = createHash('sha256').update(lease.token).digest('hex')
    db.prepare('INSERT OR REPLACE INTO lease_claims VALUES (?, ?, ?, ?)')
      .run(lease.namespace, fingerprint, lease.ownerId, JSON.stringify(Object.keys(lease.epochs).sort()))
    for (const [resource, epoch] of Object.entries(lease.epochs)) {
      db.prepare('INSERT OR REPLACE INTO resource_epochs VALUES (?, ?, ?, ?, ?, ?)')
        .run(lease.namespace, resource, epoch, lease.ownerId, fingerprint, lease.expiresAt)
    }
  } finally { db.close() }
}
