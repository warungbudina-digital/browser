/**
 * SessionStore — simpan/restore cookies browser per (profile × platform).
 *
 * Menggunakan tabel scraper_sessions di PostgreSQL yang sama dengan DataStore.
 * Session dianggap expired jika expires_at sudah lewat — dikembalikan null.
 */
export class SessionStore {
  #pool;

  constructor(pgPool) {
    this.#pool = pgPool;
  }

  /** Dipanggil dari DataStore.init() — schema sudah di-merge ke init.sql */

  /**
   * Load cookies untuk (profile, platform).
   * Return null jika tidak ada atau sudah expired.
   */
  async load(profile, platform) {
    const { rows } = await this.#pool.query(
      `SELECT cookies, expires_at
       FROM scraper_sessions
       WHERE profile = $1 AND platform = $2`,
      [profile, platform]
    );
    if (!rows.length) return null;
    const { cookies, expires_at } = rows[0];
    if (expires_at && new Date(expires_at) < new Date()) return null;
    return cookies; // JSONB sudah di-parse oleh pg driver
  }

  /**
   * Simpan cookies. expiresAt opsional — jika null, session tidak expire.
   * Platform login biasanya valid ~30 hari.
   */
  async save(profile, platform, cookies, expiresAt = null) {
    await this.#pool.query(
      `INSERT INTO scraper_sessions (profile, platform, cookies, updated_at, expires_at)
       VALUES ($1, $2, $3::jsonb, NOW(), $4)
       ON CONFLICT (profile, platform) DO UPDATE
         SET cookies    = EXCLUDED.cookies,
             updated_at = NOW(),
             expires_at = EXCLUDED.expires_at`,
      [profile, platform, JSON.stringify(cookies), expiresAt]
    );
  }

  /** Hapus session — platform=null untuk hapus semua platform milik profile ini. */
  async clear(profile, platform = null) {
    if (platform) {
      await this.#pool.query(
        'DELETE FROM scraper_sessions WHERE profile = $1 AND platform = $2',
        [profile, platform]
      );
    } else {
      await this.#pool.query(
        'DELETE FROM scraper_sessions WHERE profile = $1',
        [profile]
      );
    }
  }

  /** List semua session aktif untuk sebuah profile. */
  async list(profile) {
    const { rows } = await this.#pool.query(
      `SELECT platform, updated_at, expires_at,
              jsonb_array_length(cookies) AS cookie_count
       FROM scraper_sessions
       WHERE profile = $1
       ORDER BY platform`,
      [profile]
    );
    return rows;
  }

  /** List semua session (admin view). */
  async listAll() {
    const { rows } = await this.#pool.query(
      `SELECT profile, platform, updated_at, expires_at,
              jsonb_array_length(cookies) AS cookie_count
       FROM scraper_sessions
       ORDER BY profile, platform`
    );
    return rows;
  }
}
