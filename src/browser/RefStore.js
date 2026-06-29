export class RefStore {
  #snapshots = new Map();
  #prev      = new Map(); // targetId → snapshot before last setSnapshot

  setSnapshot(targetId, snapshot) {
    this.#prev.set(targetId, this.#snapshots.get(targetId) ?? null);
    this.#snapshots.set(targetId, {
      ...snapshot,
      capturedAt: new Date().toISOString()
    });
  }

  getSnapshot(targetId) {
    return this.#snapshots.get(targetId) ?? null;
  }

  getPrevSnapshot(targetId) {
    return this.#prev.get(targetId) ?? null;
  }

  getRef(targetId, ref) {
    const snapshot = this.getSnapshot(targetId);
    if (!snapshot) return null;
    return snapshot.refs.find((entry) => entry.ref === String(ref)) || null;
  }

  clearTarget(targetId) {
    this.#snapshots.delete(targetId);
  }

  clearAll() {
    this.#snapshots.clear();
  }
}
