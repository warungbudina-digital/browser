import { WorkspaceContext } from '../security/WorkspaceContext.js';

/**
 * createWorkspaceHook — Fastify preHandler yang attach WorkspaceContext ke setiap request.
 *
 * Harus dipasang SETELAH apiKeyHook agar request.keyName sudah tersedia.
 * WorkspaceContext dibuat dari keyName: "admin" → WorkspaceContext("admin").
 * Open mode (tanpa auth) → WorkspaceContext("default").
 */
export function createWorkspaceHook() {
  return async function workspacePreHandler(request) {
    request.workspace = new WorkspaceContext(request.keyName ?? 'default');
  };
}
