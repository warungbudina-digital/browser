// ─────────────────────────────────────────────────────────────────────────────
// Snapshot Diff Engine
// Compares two snapshots by ref identity (role|name|nth|frameIndex).
// Detects: added elements, removed elements, ARIA state changes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical match key for a ref entry.
 * Uses role + name + nth (structural position) + frameIndex.
 * Selector is intentionally excluded — DOM mutations can change CSS paths
 * without the element meaningfully changing from an agent's perspective.
 */
export function refKey(entry) {
  const r = entry.recipe ?? {};
  return `${r.role ?? ''}|${String(r.name ?? '')}|${r.nth ?? 0}|${entry.frameIndex ?? 0}`;
}

/**
 * Compare two ariaState objects for equality.
 * Both null/undefined → equal (treat as identical state).
 */
export function ariaStatesEqual(a, b) {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.checked  === b.checked  &&
    a.expanded === b.expanded &&
    a.disabled === b.disabled &&
    a.required === b.required &&
    a.current  === b.current
  );
}

/**
 * Diff two snapshots.
 *
 * @param {{ refs: object[] }|null} snapshotA  — "before" snapshot
 * @param {{ refs: object[] }|null} snapshotB  — "after" snapshot
 * @returns {{
 *   added:     object[],
 *   removed:   object[],
 *   changed:   Array<{ before: object, after: object, changedFields: string[] }>,
 *   unchanged: object[],
 *   stats:     { added, removed, changed, unchanged, total },
 *   summary:   string,
 * }}
 */
export function diff(snapshotA, snapshotB) {
  const refsA = snapshotA?.refs ?? [];
  const refsB = snapshotB?.refs ?? [];

  const mapA = new Map(refsA.map((r) => [refKey(r), r]));
  const mapB = new Map(refsB.map((r) => [refKey(r), r]));

  const added    = [];
  const removed  = [];
  const changed  = [];
  const unchanged = [];

  for (const [key, entryB] of mapB) {
    const entryA = mapA.get(key);
    if (!entryA) {
      added.push(entryB);
      continue;
    }
    const changedFields = [];
    if (!ariaStatesEqual(entryA.ariaState, entryB.ariaState)) {
      changedFields.push('ariaState');
    }
    if (changedFields.length) {
      changed.push({ before: entryA, after: entryB, changedFields });
    } else {
      unchanged.push(entryB);
    }
  }

  for (const [key, entryA] of mapA) {
    if (!mapB.has(key)) removed.push(entryA);
  }

  const stats = {
    added:     added.length,
    removed:   removed.length,
    changed:   changed.length,
    unchanged: unchanged.length,
    total:     refsB.length,
  };

  return { added, removed, changed, unchanged, stats, summary: buildSummary(stats) };
}

function buildSummary({ added, removed, changed }) {
  const parts = [];
  if (added)   parts.push(`+${added} added`);
  if (removed) parts.push(`-${removed} removed`);
  if (changed) parts.push(`~${changed} changed`);
  return parts.length ? parts.join(', ') : 'no changes';
}

/**
 * Format a diff result as human-readable text for AI agent consumption.
 */
export function diffText(result) {
  const lines = [`diff: ${result.summary}`];
  for (const e of result.added) {
    lines.push(`+ [${e.ref}] ${e.recipe?.role ?? '?'} "${e.recipe?.name ?? ''}"`);
  }
  for (const e of result.removed) {
    lines.push(`- [${e.ref}] ${e.recipe?.role ?? '?'} "${e.recipe?.name ?? ''}"`);
  }
  for (const { before, after, changedFields } of result.changed) {
    const stateA = _stateStr(before.ariaState);
    const stateB = _stateStr(after.ariaState);
    lines.push(`~ [${before.ref}→${after.ref}] ${after.recipe?.role ?? '?'} "${after.recipe?.name ?? ''}" ${stateA}→${stateB} (${changedFields.join(',')})`);
  }
  return lines.join('\n');
}

function _stateStr(s) {
  if (!s) return '{}';
  const parts = [];
  if (s.checked  != null) parts.push(`checked=${s.checked}`);
  if (s.expanded != null) parts.push(`expanded=${s.expanded}`);
  if (s.disabled != null) parts.push(`disabled=${s.disabled}`);
  if (s.required != null) parts.push(`required=${s.required}`);
  if (s.current  != null) parts.push(`current=${s.current}`);
  return parts.length ? `{${parts.join(',')}}` : '{}';
}
