/**
 * Graceful shutdown orchestrator.
 *
 * Services are shut down in a fixed, dependency-safe order:
 *   1. HTTP server  — stop accepting new requests
 *   2. SSE manager  — close all open event streams
 *   3. Scheduler    — stop spawning new scraper jobs
 *   4. JobQueue     — drain in-flight jobs, close BullMQ worker/queue
 *   5. BrowserPool  — stop all pool slots (managed profiles)
 *   6. Browser      — stop remaining active browser services
 *   7. DataStore    — end PostgreSQL connection pool
 *   8. MQTT         — close MQTT broker connection
 *
 * Each step has its own timeout (stepTimeoutMs). If the total shutdown
 * exceeds timeoutMs, the remaining steps are abandoned and shutdown()
 * returns { ok: false }.
 *
 * The module is dependency-free so it can be unit-tested with mock services.
 */

export const SHUTDOWN_STEPS = [
  { name: 'HTTP server',   key: 'server',        method: 'close'    },
  { name: 'SSE manager',   key: 'sseManager',    method: 'closeAll' },
  { name: 'Scheduler',     key: 'scheduler',     method: 'stop'     },
  { name: 'JobQueue',      key: 'jobQueue',      method: 'close'    },
  { name: 'BrowserPool',   key: 'pool',          method: 'destroy'  },
  { name: 'Browser',       key: 'browser',       method: 'stopAll'  },
  { name: 'DataStore',     key: 'dataStore',     method: 'close'    },
  { name: 'MQTT',          key: 'mqttPublisher', method: 'close'    },
];

/**
 * Execute a single shutdown step.
 * Returns a StepResult whether or not the step succeeded.
 *
 * @param {{ name: string, key: string, method: string }} step
 * @param {Record<string, object|null>} services
 * @param {{ stepTimeoutMs?: number, log?: (msg: string) => void }}
 * @returns {Promise<StepResult>}
 */
export async function runShutdownStep(step, services, { stepTimeoutMs = 5_000, log = () => {} } = {}) {
  const service = services[step.key];
  if (!service || typeof service[step.method] !== 'function') {
    return { name: step.name, skipped: true, ok: true };
  }
  try {
    await Promise.race([
      Promise.resolve(service[step.method]()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`step timeout after ${stepTimeoutMs}ms`)), stepTimeoutMs)
      ),
    ]);
    log(`[Shutdown] ✓ ${step.name}`);
    return { name: step.name, ok: true, skipped: false };
  } catch (err) {
    log(`[Shutdown] ✗ ${step.name}: ${err.message}`);
    return { name: step.name, ok: false, skipped: false, error: err.message };
  }
}

/**
 * Run all shutdown steps in order.
 *
 * @param {Record<string, object|null>} services
 * @param {{
 *   timeoutMs?:     number,   total shutdown deadline (default 30 s)
 *   stepTimeoutMs?: number,   per-step deadline (default 5 s)
 *   signal?:        string,   signal name for logging
 *   log?:           (msg: string) => void,
 *   steps?:         typeof SHUTDOWN_STEPS,  override for testing
 * }}
 * @returns {Promise<ShutdownResult>}
 */
export async function shutdown(services, {
  timeoutMs     = 30_000,
  stepTimeoutMs = 5_000,
  signal        = 'manual',
  log           = console.log,
  steps         = SHUTDOWN_STEPS,
} = {}) {
  log(`[Shutdown] Graceful shutdown dimulai (signal: ${signal})`);
  const startedAt = Date.now();

  let stepResults = null;
  let timedOut    = false;

  const runAllSteps = async () => {
    const results = [];
    for (const step of steps) {
      results.push(await runShutdownStep(step, services, { stepTimeoutMs, log }));
    }
    return results;
  };

  try {
    stepResults = await Promise.race([
      runAllSteps(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`total shutdown timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  } catch (err) {
    timedOut = true;
    log(`[Shutdown] Timeout: ${err.message} — paksa keluar`);
  }

  const durationMs = Date.now() - startedAt;
  const ok         = !timedOut && (stepResults?.every((r) => r.ok) ?? false);
  log(`[Shutdown] Selesai dalam ${durationMs}ms (${ok ? 'bersih' : 'ada error/timeout'})`);

  return { ok, durationMs, signal, timedOut, steps: stepResults ?? [] };
}
