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
//
// Conflict record. Only the device that runs a merge knows a value lost.
// When the remote value loses, the device that wrote it would see a plain
// pull later, indistinguishable from an edit made after seeing its value. So
// the merged document carries one optional, additive field:
//   syncConflict: { fields: string[]; lostAt: number }
// naming the settings whose remote value lost and the updatedAt of the
// document that lost. A device whose last applied config push has exactly
// that updatedAt shows the notice, once. The field lives only in the synced
// body (outbox and server): mergeConfig drops it on read, so the stored
// config, the merge comparison and older clients never see it, and a body
// without it (or with a malformed one) means "no conflict".
import * as db from '../../../lib/db'
import { mergeConfig } from '../../../lib/plan'
import { mergeConfigs } from './configMerge'
import { defaultDisciplines, hasDisciplines, withDisciplines } from '../../../lib/disciplineSelection'
import type { Config } from '../../../lib/types'
import * as sdb from './syncDb'
import type { OutboxEntry } from './syncDb'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export type ConflictRecord = { fields: string[]; lostAt: number }

/** The conflict record of a synced config body, or undefined. */
export function conflictRecord(body: unknown): ConflictRecord | undefined {
  const r = isObject(body) ? body.syncConflict : undefined
  if (!isObject(r) || typeof r.lostAt !== 'number' || !Number.isFinite(r.lostAt) || !Array.isArray(r.fields)) return undefined
  const fields = r.fields.filter((f): f is string => typeof f === 'string')
  return fields.length ? { fields, lostAt: r.lostAt } : undefined
}

/** `config` as a synced body, carrying `record` when there is one. */
export function withConflictRecord(config: unknown, record: ConflictRecord | undefined): unknown {
  return record ? { ...(config as Record<string, unknown>), syncConflict: record } : config
}

/** Shows the notice when a remote config reports that this device's last
 *  push lost a merge on another device. Consumes the push stamp, so the same
 *  document pulled again (a full pull) does not bring the notice back. */
async function noticeIfThisDeviceLost(remoteBody: unknown) {
  const record = conflictRecord(remoteBody)
  if (!record) return
  const pushedAt = await sdb.getConfigPushedAt()
  if (pushedAt !== record.lostAt) return
  await sdb.addConfigConflict(record.fields)
  await sdb.clearConfigPushedAt()
}

/** A pulled config as this device applies it (S10). An older client drops
 *  the fields it does not know (disciplines, swimWeeklyTarget), so for each
 *  one missing from the raw `body`, `merged` (mergeConfig of it) takes the
 *  local value instead of the default: the older device did not change it.
 *  With no local list either, the list is D2-A from the local sessions. A
 *  body that carries a field is a normal remote change and wins as usual.
 *  `local` is the raw local config (stored, or the queued body). */
export async function withLocalNewFields(body: unknown, merged: Config, local: unknown): Promise<Config> {
  const mine = isObject(local) ? mergeConfig(local) : null
  const out = await withDisciplines(body, merged, async () =>
    mine && hasDisciplines(local) ? mine.disciplines : defaultDisciplines((await db.getSessions()).sessions),
  )
  const hasTarget = (c: unknown) => isObject(c) && 'swimWeeklyTarget' in c
  return mine && !hasTarget(body) && hasTarget(local) ? { ...out, swimWeeklyTarget: mine.swimWeeklyTarget } : out
}

/** `pushedAt` is set when this device's own push was applied; without it the
 *  body came from the server. The base gets the same local values as the
 *  applied config, so a later body that does change them is seen as a change. */
export async function noteConfigSynced(body: unknown, pushedAt?: number) {
  if (!isObject(body)) return
  await sdb.saveConfigBase(await withLocalNewFields(body, mergeConfig(body), await db.getConfig()))
  if (pushedAt !== undefined) await sdb.saveConfigPushedAt(pushedAt)
  else await noticeIfThisDeviceLost(body)
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
  const theirs = await withLocalNewFields(remote.body, mergeConfig(remote.body), pending.body)
  const storedBase = await sdb.getConfigBase()
  const { merged, discarded, remoteDiscarded } = mergeConfigs(
    isObject(storedBase) ? mergeConfig(storedBase) : null,
    { config: mergeConfig(pending.body), updatedAt: pending.updatedAt },
    { config: theirs, updatedAt: remote.updatedAt },
  )
  if (!(await unchanged())) return false

  const local = await db.getConfig()
  await db.saveConfig(merged)
  await sdb.saveConfigBase(theirs)
  await noticeIfThisDeviceLost(remote.body)
  // Compared with what the server holds (mergeConfig of its body, without
  // the local values withLocalNewFields kept): a local list or target the
  // older body lacks still has to be pushed.
  if (JSON.stringify(merged) === JSON.stringify(mergeConfig(remote.body))) await sdb.removeOutboxEntry('document', 'config')
  else {
    // The device that wrote `theirs` learns which of its values lost from
    // the record; a record from an earlier merge still waiting in the queue
    // keeps travelling until it is pushed.
    const record = remoteDiscarded.length
      ? { fields: remoteDiscarded, lostAt: remote.updatedAt }
      : conflictRecord(pending.body)
    await sdb.enqueueUpsert('document', 'config', withConflictRecord(merged, record), pushAfterRemote)
  }
  if (discarded.length) await sdb.addConfigConflict(discarded)
  return JSON.stringify(local) !== JSON.stringify(merged)
}
