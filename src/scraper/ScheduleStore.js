/**
 * ScheduleStore — CRUD untuk scraper_schedules di PostgreSQL.
 * Schema diinisialisasi oleh DataStore.init() via db/init.sql.
 */
export class ScheduleStore {
  #pool;

  constructor(pgPool) {
    this.#pool = pgPool;
  }

  async listAll({ enabled } = {}) {
    const { rows } = await this.#pool.query(
      `SELECT * FROM scraper_schedules
       ${enabled != null ? `WHERE enabled = ${enabled ? 'true' : 'false'}` : ''}
       ORDER BY created_at`
    );
    return rows;
  }

  async listEnabled() { return this.listAll({ enabled: true }); }

  async get(id) {
    const { rows } = await this.#pool.query(
      'SELECT * FROM scraper_schedules WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  }

  async create({ platform, targetUrl, profileName = 'openclaw', cronExpr, options = {}, webhookUrl = null }) {
    const { rows } = await this.#pool.query(
      `INSERT INTO scraper_schedules
         (platform, target_url, profile_name, cron_expr, options, webhook_url)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [platform, targetUrl, profileName, cronExpr, JSON.stringify(options), webhookUrl]
    );
    return rows[0];
  }

  async update(id, { platform, targetUrl, profileName, cronExpr, options, webhookUrl, enabled } = {}) {
    const { rows } = await this.#pool.query(
      `UPDATE scraper_schedules SET
         platform     = COALESCE($2,           platform),
         target_url   = COALESCE($3,           target_url),
         profile_name = COALESCE($4,           profile_name),
         cron_expr    = COALESCE($5,           cron_expr),
         options      = COALESCE($6::jsonb,    options),
         webhook_url  = COALESCE($7,           webhook_url),
         enabled      = COALESCE($8,           enabled),
         updated_at   = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        platform     ?? null,
        targetUrl    ?? null,
        profileName  ?? null,
        cronExpr     ?? null,
        options      != null ? JSON.stringify(options) : null,
        webhookUrl   ?? null,
        enabled      ?? null,
      ]
    );
    return rows[0] ?? null;
  }

  async delete(id) {
    await this.#pool.query('DELETE FROM scraper_schedules WHERE id = $1', [id]);
  }

  /** Update last_run_at setelah job berhasil di-submit. */
  async touchRun(id) {
    await this.#pool.query(
      'UPDATE scraper_schedules SET last_run_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );
  }
}
