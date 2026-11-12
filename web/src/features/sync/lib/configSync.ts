// Engine glue for the config merge (S15). The engine calls these at three
// points, and nowhere else:
// - noteConfigSynced: whenever the server and this device agree on a config
//   (a pulled config was applied, a pushed config was applied, or the first
//   sign-in downloaded one). It stores the base of the next merge.
// - mergePendingConfig: a remote config arrived while a local config change
//   is still queued. Instead of skipping the remote copy (and later losing it
//   to the push, or losing the push to it), both are merged field by field
//   against the base; the merge is written locally and queued in place of
//   the local change.
// Local writes still go through db.ts and the existing outbox helpers.
import * as db from '../../../lib/db'
import { mergeConfig } from '../../../lib/plan'
import { mergeConfigs } from './configMerge'
import * as sdb from './syncDb'
import type { OutboxEntry } from './syncDb'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export async function noteConfigSynced(body: unknown) {
  if (isObject(body)) await sdb.saveConfigBase(mergeConfig(body))
}

/** Merges `remote` into the queued local config `pending`. Returns whether the
 *  local config changed. The merged entry is queued with an updatedAt past
 *  the remote copy's so the server applies it; when the merge equals the
 *  remote copy there is nothing left to push and the entry leaves the queue. */
export async function mergePendingConfig(
  pending: OutboxEntry,
  remote: { body: unknown; updatedAt: number; deletedAt: number | null },
): Promise<boolean> {
  const unchanged = async () => {
    // A local write that landed while merging wins this round; the next sync
    // merges it.
    const now = await sdb.getOutboxEntry('document', 'config')
    return !!now && now.updatedAt === pending.updatedAt && now.deletedAt === pending.deletedAt
  }
  const pushAfterRemote = Math.max(pending.updatedAt, remote.updatedAt + 1)
  if (remote.deletedAt != null || !isObject(remote.body)) {
    // The app never deletes config and an unreadable copy cannot be merged:
    // the local copy wins, queued past the remote one so it cannot come back
    // stale forever.
    if (await unchanged()) await sdb.enqueueUpsert('document', 'config', pending.body, pushAfterRemote)
    return false
  }
  const theirs = mergeConfig(remote.body)
  const storedBase = await sdb.getConfigBase()
  const { merged, discarded } = mergeConfigs(
    isObject(storedBase) ? mergeConfig(storedBase) : null,
    { config: mergeConfig(pending.body), updatedAt: pending.updatedAt },
    { config: theirs, updatedAt: remote.updatedAt },
  )
  if (!(await unchanged())) return false

  const local = await db.getConfig()
  await db.saveConfig(merged)
  await sdb.saveConfigBase(theirs)
  if (JSON.stringify(merged) === JSON.stringify(theirs)) await sdb.removeOutboxEntry('document', 'config')
  else await sdb.enqueueUpsert('document', 'config', merged, pushAfterRemote)
  if (discarded.length) await sdb.addConfigConflict(discarded)
  return JSON.stringify(local) !== JSON.stringify(merged)
}
