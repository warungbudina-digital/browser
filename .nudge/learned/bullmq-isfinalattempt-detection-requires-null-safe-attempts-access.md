# BullMQ isFinalAttempt detection requires null-safe attempts access

## What went wrong
To update DataStore to 'failed' only on the last retry (not intermediate failures),
the worker needs to know if the current attempt is the final one. The naive check
`bullJob.attemptsMade >= bullJob.opts.attempts - 1` fails when opts.attempts is
undefined (job added without explicit attempts option), causing NaN comparison and
DataStore never receiving the 'failed' status.

## Fix
Use nullish coalescing to default attempts to 1:

```js
const isFinal = bullJob.attemptsMade >= (bullJob.opts.attempts ?? 1) - 1;
```

This is required in both the pool-acquire catch block and the scraper catch block:

```js
// acquire timeout
slot = await pool.acquire(jobId, 90_000).catch(async (err) => {
  if (isFinal) await dataStore.updateJob(jobId, { status: 'failed', error: err.message });
  throw err;
});

// scraper error
} catch (err) {
  if (isFinal) await dataStore.updateJob(jobId, { status: 'failed', error: err.message });
  throw err; // rethrow so BullMQ retries
}
```

## Verification
Submit a job with an invalid URL. After 3 attempts (default), scraper_jobs.status
in PostgreSQL should be 'failed', not stuck at 'running'.
