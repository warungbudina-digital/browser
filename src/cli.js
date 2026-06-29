#!/usr/bin/env node

const [,, command, ...rest] = process.argv;
const baseUrl = process.env.FULL_TOOL_BROWSER_URL || 'http://127.0.0.1:8080';

function take(flag) {
  const index = rest.indexOf(flag);
  if (index === -1) return undefined;
  return rest[index + 1];
}

function has(flag) {
  return rest.includes(flag);
}

function endpoint(pathname) {
  return `${baseUrl.replace(/\/$/, '')}${pathname}`;
}

function buildRequestPayload() {
  switch (command) {
    case 'status':
    case 'start':
    case 'stop':
    case 'tabs':
      return { action: command, profile: take('--profile') };
    case 'open':
    case 'navigate':
      return { action: command, url: rest[0], targetId: take('--target'), profile: take('--profile') };
    case 'focus':
    case 'close':
      return { action: command, targetId: rest[0] || take('--target'), profile: take('--profile') };
    case 'snapshot':
      return { action: 'snapshot', targetId: take('--target'), interactive: has('--interactive'), selector: take('--selector'), limit: take('--limit') ? Number(take('--limit')) : undefined, profile: take('--profile') };
    case 'screenshot':
      return { action: 'screenshot', targetId: take('--target'), ref: take('--ref'), selector: take('--selector'), fullPage: has('--full-page'), path: take('--path'), profile: take('--profile') };
    case 'pdf':
      return { action: 'pdf', targetId: take('--target'), path: take('--path'), profile: take('--profile') };
    case 'upload':
      return { action: 'upload', targetId: take('--target'), ref: take('--ref'), selector: take('--selector'), paths: (take('--paths') || '').split(',').map((v) => v.trim()).filter(Boolean), profile: take('--profile') };
    case 'download':
      return { action: 'download', targetId: take('--target'), ref: take('--ref'), selector: take('--selector'), path: take('--path'), suggestedFilename: take('--name'), timeoutMs: take('--timeout-ms') ? Number(take('--timeout-ms')) : undefined, profile: take('--profile') };
    case 'trace-start':
      return { action: 'trace', traceAction: 'start', profile: take('--profile'), title: take('--title'), screenshots: !has('--no-screenshots'), snapshots: !has('--no-snapshots'), sources: !has('--no-sources') };
    case 'trace-stop':
      return { action: 'trace', traceAction: 'stop', profile: take('--profile'), path: take('--path') };
    case 'console':
    case 'errors':
    case 'requests':
      return { action: command, targetId: take('--target'), level: take('--level'), filter: take('--filter'), clear: has('--clear'), profile: take('--profile') };
    case 'dialog':
      return { action: 'dialog', targetId: take('--target'), accept: !has('--dismiss'), promptText: take('--prompt'), profile: take('--profile') };
    case 'act': {
      const raw = take('--json');
      if (!raw) throw new Error('act requires --json');
      return { action: 'act', request: JSON.parse(raw), targetId: take('--target'), profile: take('--profile') };
    }
    default:
      throw new Error(`Unknown browser command: ${command}`);
  }
}

function buildProfilePayload() {
  switch (command) {
    case 'profiles':
      return { action: 'list' };
    case 'profile-get':
      return { action: 'get', name: rest[0] };
    case 'profile-select':
      return { action: 'select', name: rest[0] };
    case 'profile-remove':
      return { action: 'remove', name: rest[0] };
    case 'profile-create':
    case 'profile-update': {
      const raw = take('--json');
      if (!raw) throw new Error(`${command} requires --json`);
      return { action: command === 'profile-create' ? 'create' : 'update', name: rest[0], profile: JSON.parse(raw) };
    }
    default:
      return null;
  }
}

async function main() {
  if (command === 'capabilities') {
    const res = await fetch(endpoint('/browser/capabilities'));
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }

  const profilePayload = buildProfilePayload();
  if (profilePayload) {
    const res = await fetch(endpoint('/browser/profiles'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(profilePayload)
    });
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }

  const payload = buildRequestPayload();

  const res = await fetch(endpoint('/browser/request'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}

await main();
