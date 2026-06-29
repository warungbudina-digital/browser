/**
 * ScriptRunner — executes a sequence of act-request steps via a callback.
 *
 * Decoupled from BrowserService so it can be unit-tested without a browser.
 * The caller supplies `actFn`, which is `(request) => Promise<result>`.
 *
 * @param {(request: object) => Promise<object>} actFn
 * @param {{ steps: object[], stopOnError?: boolean }}
 * @returns {Promise<RunResult>}
 */
export async function runScript(actFn, { steps, stopOnError = true } = {}) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return {
      ok:      true,
      results: [],
      stats:   { total: 0, executed: 0, passed: 0, failed: 0, stopped: false },
    };
  }

  const results = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      const result = await actFn(step);
      const ok     = result?.ok !== false;
      results.push({ index: i, ok, kind: step.kind ?? null, result });
      if (!ok && stopOnError) break;
    } catch (err) {
      results.push({ index: i, ok: false, kind: step.kind ?? null, error: err.message });
      if (stopOnError) break;
    }
  }

  const failed  = results.filter((r) => !r.ok).length;
  const passed  = results.length - failed;
  const stopped = results.length < steps.length;

  return {
    ok:      failed === 0 && !stopped,
    results,
    stats:   { total: steps.length, executed: results.length, passed, failed, stopped },
  };
}
