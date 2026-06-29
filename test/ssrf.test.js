import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBrowserNavigationAllowed, normalizeSsrfPolicy } from '../src/security/ssrf.js';

test('strict SSRF blocks private IP navigation by default', async () => {
  await assert.rejects(
    assertBrowserNavigationAllowed({ url: 'http://192.168.1.10', ssrfPolicy: normalizeSsrfPolicy({}) }),
    /private IP/
  );
});

test('allowlist permits hostname navigation in strict mode', async () => {
  await assert.doesNotReject(() => assertBrowserNavigationAllowed({
    url: 'https://docs.example.com',
    ssrfPolicy: normalizeSsrfPolicy({ hostnameAllowlist: ['*.example.com'] }),
    lookupFn: async () => [{ address: '93.184.216.34' }]
  }));
});
