// Dashboard monitor HTML — sengaja satu template literal tanpa nested backtick
// (node --check gagal pada nested template literal di dalam HTML, lihat .nudge/learned)
export const ADMIN_DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Browser Scraper — Monitor</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:ui-monospace,monospace;background:#0d1117;color:#c9d1d9;padding:20px}
    h1{color:#58a6ff;font-size:16px;margin-bottom:16px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:16px;margin:12px 0}
    .card h2{color:#79c0ff;font-size:13px;margin-bottom:12px;display:flex;justify-content:space-between}
    .card h2 span{color:#8b949e;font-size:11px;font-weight:normal}
    .metrics{display:flex;flex-wrap:wrap;gap:16px}
    .metric .label{color:#8b949e;font-size:11px}
    .metric .value{font-size:28px;font-weight:bold;line-height:1.2}
    .busy{color:#f85149}.free{color:#3fb950}.warn{color:#e3b341}
    .slots{margin-top:10px;display:flex;flex-wrap:wrap;gap:4px}
    .slot{padding:4px 10px;border-radius:4px;font-size:12px;line-height:1.6}
    .slot.busy{background:#3d1f1e;border:1px solid #f85149;color:#f85149}
    .slot.free{background:#1a2e1a;border:1px solid #3fb950;color:#3fb950}
    .slot small{display:block;font-size:10px;opacity:.7}
    .err{color:#f85149;font-size:12px;margin-top:8px}
    .alert-ok{color:#3fb950}.alert-firing{color:#f85149}
    .sublabel{color:#8b949e;font-size:11px;margin:8px 0 4px}
  </style>
</head>
<body>
  <h1>Browser Scraper — Monitor</h1>

  <div class="card">
    <h2>Browser Pool <span id="ts-pool"></span></h2>
    <div class="metrics" id="pool-metrics"></div>
    <div class="slots"   id="pool-slots"></div>
    <div class="err"     id="pool-err"></div>
  </div>

  <div class="card">
    <h2>Job Queue (BullMQ) <span id="ts-queue"></span></h2>
    <div class="metrics" id="queue-metrics"></div>
    <div class="err"     id="queue-err"></div>
  </div>

  <div class="card">
    <h2>Sessions</h2>
    <div id="session-list" style="font-size:12px;line-height:1.8"></div>
    <div class="err" id="session-err"></div>
  </div>

  <div class="card">
    <h2>Schedules <span id="ts-sched"></span></h2>
    <div class="metrics" id="sched-metrics"></div>
    <div id="sched-list" style="margin-top:10px;font-size:12px;line-height:1.8"></div>
    <div class="err" id="sched-err"></div>
  </div>

  <div class="card">
    <h2>Metrics <span id="ts-metrics"></span></h2>
    <div class="metrics" id="metrics-breakdown"></div>
    <div class="sublabel">Platform Alerts</div>
    <div id="alerts-breakdown" style="font-size:12px;line-height:1.8"></div>
    <div class="err" id="metrics-err"></div>
  </div>

  <div class="card">
    <h2>SSE Connections <span id="ts-sse"></span></h2>
    <div class="metrics" id="sse-metrics"></div>
    <div id="sse-topics" style="font-size:12px;line-height:1.8;margin-top:8px"></div>
    <div class="err" id="sse-err"></div>
  </div>

  <div class="card">
    <h2>API Keys &amp; Rate Limits <span id="ts-keys"></span></h2>
    <div id="keys-list" style="font-size:12px;line-height:1.8"></div>
    <div class="err" id="keys-err"></div>
  </div>

  <div class="card">
    <h2>Audit Log <span id="ts-audit"></span></h2>
    <div class="metrics" id="audit-stats"></div>
    <div class="sublabel">Recent requests</div>
    <div id="audit-list" style="font-size:11px;line-height:1.8;font-family:monospace"></div>
    <div class="err" id="audit-err"></div>
  </div>

  <script>
    const now = () => new Date().toLocaleTimeString();
    function metric(label, value, cls='') {
      return '<div class="metric"><div class="label">'+label+'</div><div class="value '+cls+'">'+value+'</div></div>';
    }

    async function refreshPool() {
      try {
        const p = await fetch('/monitor/pool').then(r => r.json());
        document.getElementById('ts-pool').textContent = now();
        document.getElementById('pool-err').textContent = '';
        document.getElementById('pool-metrics').innerHTML =
          metric('Size',   p.size)  +
          metric('Busy',   p.busy,           'busy') +
          metric('Free',   p.size - p.busy,  'free');
        document.getElementById('pool-slots').innerHTML = p.slots.map(s =>
          '<div class="slot '+(s.busy?'busy':'free')+'">'+s.profile+
          (s.jobId ? '<small>'+s.jobId.slice(0,8)+'…</small>' : '')+
          '</div>'
        ).join('');
      } catch(e) {
        document.getElementById('pool-err').textContent = 'Pool tidak tersedia';
      }
    }

    async function refreshQueue() {
      try {
        const q = await fetch('/monitor/queue').then(r => r.json());
        document.getElementById('ts-queue').textContent = now();
        document.getElementById('queue-err').textContent = '';
        document.getElementById('queue-metrics').innerHTML =
          metric('Waiting',   q.waiting,   q.waiting   > 10 ? 'warn' : '') +
          metric('Active',    q.active,    'free')  +
          metric('Completed', q.completed, '')       +
          metric('Failed',    q.failed,    q.failed > 0 ? 'busy' : '') +
          metric('Delayed',   q.delayed,   '');
      } catch(e) {
        document.getElementById('queue-err').textContent = 'Queue tidak tersedia';
      }
    }

    async function refreshSessions() {
      try {
        const s = await fetch('/sessions').then(r => r.json());
        document.getElementById('session-err').textContent = '';
        if (!s.sessions?.length) {
          document.getElementById('session-list').textContent = 'Belum ada session tersimpan.';
          return;
        }
        document.getElementById('session-list').innerHTML = s.sessions.map(r =>
          '<div><span style="color:#79c0ff">'+r.profile+'</span> / <span style="color:#e3b341">'+r.platform+'</span> — '+r.cookie_count+' cookies — updated '+new Date(r.updated_at).toLocaleString()+(r.expires_at ? ' — exp '+new Date(r.expires_at).toLocaleDateString() : '')+'</div>'
        ).join('');
      } catch {
        document.getElementById('session-err').textContent = 'Sessions tidak tersedia';
      }
    }

    async function refreshSchedules() {
      try {
        const h = await fetch('/monitor/health').then(r => r.json());
        const s = h.scheduler;
        if (!s) { document.getElementById('sched-err').textContent = 'Scheduler tidak aktif'; return; }
        document.getElementById('ts-sched').textContent = now();
        document.getElementById('sched-metrics').innerHTML =
          metric('Aktif', s.count, s.count > 0 ? 'free' : '');
        const list = await fetch('/schedules').then(r => r.json());
        document.getElementById('sched-list').innerHTML = (list.schedules||[]).map(s =>
          '<div><span style="color:#79c0ff">'+s.platform+'</span> | <span style="color:#e3b341">'+s.cron_expr+'</span> | '+
          s.target_url.slice(0,50)+(s.target_url.length>50?'…':'')+
          ' | '+(s.enabled ? '<span style="color:#3fb950">on</span>' : '<span style="color:#8b949e">off</span>')+
          (s.last_run_at ? ' | last: '+new Date(s.last_run_at).toLocaleString() : '')+
          '</div>'
        ).join('') || '<div style="color:#8b949e">Belum ada jadwal</div>';
        document.getElementById('sched-err').textContent = '';
      } catch { document.getElementById('sched-err').textContent = 'Gagal load schedules'; }
    }

    async function refreshMetrics() {
      try {
        const m = await fetch('/monitor/metrics').then(r => r.json());
        document.getElementById('ts-metrics').textContent = now();
        document.getElementById('metrics-err').textContent = '';

        const c = m.metrics ? m.metrics.counters : {};
        let completed = 0, failed = 0, retries = 0;
        for (const key of Object.keys(c)) {
          if (key.indexOf('status="completed"') !== -1) completed += c[key];
          if (key.indexOf('status="failed"')    !== -1) failed    += c[key];
          if (key.indexOf('scraper_retries_total') !== -1) retries += c[key];
        }
        const sums = m.metrics ? m.metrics.summaries : {};
        let durSum = 0, durCount = 0;
        for (const v of Object.values(sums)) { durSum += v.sum; durCount += v.count; }
        const avgDur = durCount > 0 ? (durSum / durCount).toFixed(1) + 's' : '—';

        document.getElementById('metrics-breakdown').innerHTML =
          metric('Completed', completed, 'free') +
          metric('Failed',    failed,    failed  > 0 ? 'busy' : '') +
          metric('Retries',   retries,   retries > 0 ? 'warn' : '') +
          metric('Avg Dur',   avgDur,    '');

        const alerts = m.alerts || {};
        const entries = Object.keys(alerts);
        if (entries.length === 0) {
          document.getElementById('alerts-breakdown').innerHTML = '<div style="color:#8b949e">Tidak ada alert</div>';
        } else {
          document.getElementById('alerts-breakdown').innerHTML = entries.map(function(platform) {
            const info = alerts[platform];
            const cls  = info.alerting ? 'alert-firing' : 'alert-ok';
            return '<div><span style="color:#79c0ff">' + platform + '</span> — consecutive fails: <span class="' + cls + '">' + info.consecutiveFailures + '</span>/' + info.alertThreshold + '</div>';
          }).join('');
        }
      } catch(e) {
        document.getElementById('metrics-err').textContent = 'Metrics tidak tersedia';
      }
    }

    async function refreshSse() {
      try {
        const s = await fetch('/events/status').then(r => r.json());
        document.getElementById('ts-sse').textContent = now();
        document.getElementById('sse-err').textContent = '';
        document.getElementById('sse-metrics').innerHTML = metric('Clients', s.connections, s.connections > 0 ? 'free' : '');
        document.getElementById('sse-topics').innerHTML = s.topics.length
          ? 'Topics aktif: <span style="color:#e3b341">' + s.topics.join(', ') + '</span>'
          : '<span style="color:#8b949e">Belum ada event diterbitkan</span>';
      } catch { document.getElementById('sse-err').textContent = 'SSE tidak aktif'; }
    }

    async function refreshKeys() {
      try {
        const k = await fetch('/admin/keys').then(r => r.json());
        document.getElementById('ts-keys').textContent = now();
        document.getElementById('keys-err').textContent = '';
        const usage = k.usage || {};
        document.getElementById('keys-list').innerHTML = (k.keys || []).map(function(name) {
          const u = usage[name];
          return '<div><span style="color:#79c0ff">' + name + '</span>' +
            (u ? ' — ' + u.minuteUsed + '/' + u.rpmLimit + ' rpm | ' + u.hourUsed + '/' + u.rphLimit + ' rph' : '') +
            '</div>';
        }).join('') || '<div style="color:#8b949e">Auth tidak aktif (open mode)</div>';
      } catch { document.getElementById('keys-list').innerHTML = '<div style="color:#8b949e">Auth tidak aktif (open mode)</div>'; }
    }

    async function refreshAudit() {
      try {
        const [stats, log] = await Promise.all([
          fetch('/admin/audit/stats').then(r => r.json()),
          fetch('/admin/audit?limit=20').then(r => r.json()),
        ]);
        document.getElementById('ts-audit').textContent = now();
        document.getElementById('audit-err').textContent = '';

        const s = stats.stats || {};
        document.getElementById('audit-stats').innerHTML = Object.keys(s).map(function(k) {
          return metric(k, s[k].total) + metric('OK', s[k].success, 'free') + metric('Err', s[k].error, s[k].error > 0 ? 'busy' : '') + metric('Avg', s[k].avgDurationMs + 'ms', '');
        }).join('') || metric('Total', stats.total || 0);

        document.getElementById('audit-list').innerHTML = (log.items || []).map(function(e) {
          const ts  = new Date(e.ts).toLocaleTimeString();
          const cls = e.status >= 400 ? 'color:#f85149' : 'color:#3fb950';
          return '<div><span style="color:#8b949e">' + ts + '</span> <span style="' + cls + '">' + e.status + '</span> <span style="color:#e3b341">' + e.method + '</span> <span style="color:#c9d1d9">' + e.path + '</span> <span style="color:#8b949e">' + e.durationMs + 'ms</span>' +
            (e.keyName && e.keyName !== 'anonymous' ? ' <span style="color:#79c0ff">[' + e.keyName + ']</span>' : '') + '</div>';
        }).join('') || '<div style="color:#8b949e">Belum ada request tercatat</div>';
      } catch { document.getElementById('audit-err').textContent = 'Audit log tidak tersedia'; }
    }

    function refresh() { refreshPool(); refreshQueue(); refreshSessions(); refreshSchedules(); refreshMetrics(); refreshSse(); refreshKeys(); refreshAudit(); }
    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`;
