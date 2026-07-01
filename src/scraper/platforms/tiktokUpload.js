const PLATFORM = 'tiktok';

// ─────────────────────────────────────────────
// Selectors — best-guess against TikTok's upload page. Unverified against a
// live authenticated session (needs one real end-to-end run to correct —
// see tiktokscraper-s-extract-videos-returns-0-posts nudge note for how the
// scraper side of this was diagnosed the same way). Kept as named constants
// so a live-test correction touches one line, not the whole flow.
// ─────────────────────────────────────────────

const UPLOAD_URL = 'https://www.tiktok.com/upload?lang=en';
const SEL_FILE_INPUT     = 'input[type="file"]';
const SEL_CAPTION        = '[data-e2e="video-caption"] [contenteditable="true"]';
const SEL_SCHEDULE_TOGGLE = '[data-e2e="schedule-switch"]';
const SEL_SCHEDULE_DATE  = '[data-e2e="schedule-date-input"]';
const SEL_SCHEDULE_TIME  = '[data-e2e="schedule-time-input"]';
const SEL_POST_BUTTON    = '[data-e2e="post-button"]';
const TEXT_UPLOADING     = 'Uploading';

const MIN_SCHEDULE_MINUTES = 20;
const MAX_SCHEDULE_DAYS    = 10;

/** Validasi + bulatkan waktu schedule (aturan sama dengan tiktok_manager.py). */
function normalizeSchedule(schedule) {
  if (!schedule) return null;
  const dt = schedule instanceof Date ? schedule : new Date(schedule);
  if (Number.isNaN(dt.getTime())) throw new Error(`Schedule tidak valid: ${schedule}`);

  const now = new Date();
  const minMs = now.getTime() + MIN_SCHEDULE_MINUTES * 60_000;
  const maxMs = now.getTime() + MAX_SCHEDULE_DAYS * 24 * 60 * 60_000;
  if (dt.getTime() < minMs) throw new Error(`Schedule harus minimal ${MIN_SCHEDULE_MINUTES} menit dari sekarang`);
  if (dt.getTime() > maxMs) throw new Error(`Schedule harus dalam ${MAX_SCHEDULE_DAYS} hari dari sekarang`);

  const rounded = new Date(dt);
  const remainder = rounded.getMinutes() % 5;
  if (remainder) rounded.setMinutes(rounded.getMinutes() + (5 - remainder));
  return rounded;
}

export class TikTokUploader {
  async publish(dispatch, { videoPath, description = '', visibility = 'everyone', schedule = null } = {}) {
    if (!videoPath) throw new Error('videoPath wajib diisi');
    const scheduleAt = normalizeSchedule(schedule); // lempar cepat sebelum browser dipakai

    await this.#openUploadPage(dispatch);
    await this.#pickFile(dispatch, videoPath);
    await this.#waitForProcessing(dispatch);
    if (description) await this.#fillCaption(dispatch, description);
    if (scheduleAt) await this.#applySchedule(dispatch, scheduleAt);
    await this.#publish(dispatch);
    const postUrl = await this.#waitForSuccess(dispatch);

    return { ok: true, platform: PLATFORM, postUrl };
  }

  async #openUploadPage(dispatch) {
    await dispatch('navigate', { url: UPLOAD_URL });
    await dispatch('act', { request: { kind: 'wait', selector: SEL_FILE_INPUT, timeoutMs: 20_000 } });
  }

  async #pickFile(dispatch, videoPath) {
    await dispatch('upload', { selector: SEL_FILE_INPUT, paths: [videoPath] });
  }

  async #waitForProcessing(dispatch) {
    await dispatch('act', { request: { kind: 'wait', textGone: TEXT_UPLOADING, timeoutMs: 90_000 } });
  }

  async #fillCaption(dispatch, description) {
    await dispatch('act', {
      request: { kind: 'type', selector: SEL_CAPTION, text: description, slowly: true, timeoutMs: 15_000 }
    });
  }

  async #applySchedule(dispatch, scheduleAt) {
    await dispatch('act', { request: { kind: 'click', selector: SEL_SCHEDULE_TOGGLE, timeoutMs: 10_000 } });
    const date = scheduleAt.toISOString().slice(0, 10);       // YYYY-MM-DD
    const time = scheduleAt.toTimeString().slice(0, 5);       // HH:MM
    await dispatch('act', {
      request: {
        kind: 'fill',
        fields: [
          { selector: SEL_SCHEDULE_DATE, value: date },
          { selector: SEL_SCHEDULE_TIME, value: time },
        ],
      },
    });
  }

  async #publish(dispatch) {
    await dispatch('act', { request: { kind: 'click', selector: SEL_POST_BUTTON, timeoutMs: 15_000 } });
  }

  async #waitForSuccess(dispatch) {
    await dispatch('act', {
      request: { kind: 'wait', url: '**/@*', timeoutMs: 30_000 }
    });
    const { result } = await dispatch('act', {
      request: { kind: 'evaluate', fn: '() => window.location.href' }
    });
    return typeof result === 'string' && result.includes('tiktok.com/@') ? result : null;
  }
}

export const SUPPORTED_VIDEO_FORMATS = new Set([
  '.mp4', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp', '.3g2', '.gif',
]);
