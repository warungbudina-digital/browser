/**
 * WorkspaceContext — namespace isolation helper per API key.
 *
 * Prinsip:
 *   - Workspace "default" → tidak ada prefix (backward compatible, open mode)
 *   - Workspace "admin"   → profile names di-prefix "admin:"
 *
 * Contoh:
 *   const ws = new WorkspaceContext('admin')
 *   ws.qualify('openclaw')      → 'admin:openclaw'
 *   ws.unqualify('admin:openclaw') → 'openclaw'
 *   ws.owns('admin:openclaw')   → true
 *   ws.owns('bot:openclaw')     → false
 *   ws.owns('openclaw')         → false  (milik default workspace)
 */
export class WorkspaceContext {
  #name;

  /** @param {string|null|undefined} name — key name dari KeyStore, atau null untuk default */
  constructor(name) {
    this.#name = name && name !== '' ? name : 'default';
  }

  /** Nama workspace ini. */
  get name() { return this.#name; }

  /** True jika ini workspace "default" (open mode / no prefix). */
  get isDefault() { return this.#name === 'default'; }

  /**
   * Tambahkan workspace prefix ke profile name.
   * Idempotent — tidak re-prefix jika sudah ada colon.
   * @param {string|null|undefined} profileName
   * @returns {string|null|undefined}
   */
  qualify(profileName) {
    if (!profileName || this.isDefault) return profileName;
    if (String(profileName).includes(':')) return profileName;
    return this.#name + ':' + profileName;
  }

  /**
   * Hapus workspace prefix dari profile name.
   * @param {string|null|undefined} qualifiedName
   * @returns {string|null|undefined}
   */
  unqualify(qualifiedName) {
    if (!qualifiedName || this.isDefault) return qualifiedName;
    const prefix = this.#name + ':';
    const s = String(qualifiedName);
    return s.startsWith(prefix) ? s.slice(prefix.length) : s;
  }

  /**
   * Cek apakah qualified name dimiliki workspace ini.
   * @param {string|null|undefined} qualifiedName
   * @returns {boolean}
   */
  owns(qualifiedName) {
    if (!qualifiedName) return false;
    const s = String(qualifiedName);
    if (this.isDefault) return !s.includes(':');
    return s.startsWith(this.#name + ':');
  }

  /**
   * Filter array of qualified profile names ke yang dimiliki workspace ini.
   * @param {string[]} names
   * @returns {string[]}
   */
  filter(names) {
    return names.filter((n) => this.owns(n));
  }
}
