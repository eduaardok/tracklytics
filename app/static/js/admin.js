import { runEtl, getEtlLogs } from './api.js';

// ---------------------------------------------------------------------------
// Footer year + active nav
// ---------------------------------------------------------------------------

document.getElementById('footer-year').textContent = new Date().getFullYear();

document.querySelectorAll('.nav-link').forEach(link => {
  if (link.getAttribute('href') === window.location.pathname.split('/').pop()) {
    link.classList.add('active');
  }
});

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

function showLoading(container) {
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
}

function showError(container, message) {
  container.innerHTML = `
    <div class="error-state">
      <p class="error-message">${message}</p>
      <button class="dismiss-btn" onclick="this.closest('.error-state').remove()">Dismiss</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// ETL result panel
// ---------------------------------------------------------------------------

function showRunning() {
  const box     = document.getElementById('etl-result');
  const icon    = document.getElementById('result-icon');
  const title   = document.getElementById('result-title');
  const message = document.getElementById('result-message');
  const stats   = document.getElementById('result-stats');

  box.className  = 'etl-result visible running';
  icon.textContent  = '⏳';
  title.textContent = 'Running ETL…';
  message.textContent = 'This may take several minutes while the full dataset is processed. Please wait.';
  stats.innerHTML = '';
}

function showResult(data) {
  const box     = document.getElementById('etl-result');
  const icon    = document.getElementById('result-icon');
  const title   = document.getElementById('result-title');
  const message = document.getElementById('result-message');
  const stats   = document.getElementById('result-stats');

  const isSuccess = data.status === 'success';
  box.className = `etl-result visible ${isSuccess ? 'success' : 'failed'}`;

  icon.textContent  = isSuccess ? '✅' : '❌';
  title.textContent = isSuccess ? 'ETL completed successfully' : 'ETL failed';
  message.textContent = data.message || '';

  if (data.log) {
    const log = data.log;
    stats.innerHTML = `
      <div class="etl-stat">
        <div class="etl-stat-label">Records Read</div>
        <div class="etl-stat-value">${log.records_read.toLocaleString()}</div>
      </div>
      <div class="etl-stat">
        <div class="etl-stat-label">Inserted</div>
        <div class="etl-stat-value">${log.records_inserted.toLocaleString()}</div>
      </div>
      <div class="etl-stat">
        <div class="etl-stat-label">Rejected</div>
        <div class="etl-stat-value">${log.records_rejected.toLocaleString()}</div>
      </div>
      <div class="etl-stat">
        <div class="etl-stat-label">Status</div>
        <div class="etl-stat-value" style="font-size:1rem;">${log.status}</div>
      </div>
      <div class="etl-stat" style="grid-column: span 2;">
        <div class="etl-stat-label">Timestamp</div>
        <div class="etl-stat-value" style="font-size:0.95rem;">${formatTimestamp(log.run_timestamp)}</div>
      </div>
    `;
  } else {
    stats.innerHTML = '';
  }
}

// ---------------------------------------------------------------------------
// Run ETL button
// ---------------------------------------------------------------------------

const runBtn = document.getElementById('run-etl-btn');

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  runBtn.classList.add('running');
  runBtn.querySelector('.btn-label').textContent = 'Running…';

  showRunning();

  try {
    const result = await runEtl();
    showResult(result);
    // Reload logs table after a successful run
    loadLogs();
  } catch (err) {
    showResult({ status: 'failed', message: err.message, log: null });
  } finally {
    runBtn.disabled = false;
    runBtn.classList.remove('running');
    runBtn.querySelector('.btn-label').textContent = 'Run ETL';
  }
});

// ---------------------------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------------------------

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusBadge(status) {
  const s = (status || 'unknown').toLowerCase();
  return `<span class="status-badge ${s}">${s}</span>`;
}

// ---------------------------------------------------------------------------
// Logs table
// ---------------------------------------------------------------------------

function renderLogsTable(logs) {
  const container = document.getElementById('logs-container');

  if (!logs || logs.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); padding:1rem 0;">No ETL executions recorded yet.</p>';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Timestamp</th>
        <th>Read</th>
        <th>Inserted</th>
        <th>Rejected</th>
        <th>Status</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${logs.map(log => `
        <tr>
          <td style="color:var(--text-muted);">${log.log_id}</td>
          <td style="white-space:nowrap;">${formatTimestamp(log.run_timestamp)}</td>
          <td>${log.records_read.toLocaleString()}</td>
          <td>${log.records_inserted.toLocaleString()}</td>
          <td>${log.records_rejected.toLocaleString()}</td>
          <td>${statusBadge(log.status)}</td>
          <td class="notes-cell" title="${log.notes || ''}">${log.notes || '—'}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  container.innerHTML = '';
  container.appendChild(table);
}

async function loadLogs() {
  const container = document.getElementById('logs-container');
  showLoading(container);
  try {
    const logs = await getEtlLogs(20);
    renderLogsTable(logs);
  } catch (err) {
    showError(container, err.message);
  }
}

// ---------------------------------------------------------------------------
// Refresh button
// ---------------------------------------------------------------------------

document.getElementById('refresh-logs-btn').addEventListener('click', () => {
  const icon = document.getElementById('refresh-icon');
  icon.style.transition = 'transform 0.4s ease';
  icon.style.transform  = 'rotate(360deg)';
  setTimeout(() => {
    icon.style.transition = 'none';
    icon.style.transform  = 'rotate(0deg)';
  }, 420);
  loadLogs();
});

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

loadLogs();