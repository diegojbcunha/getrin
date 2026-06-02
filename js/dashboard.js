/* =============================================================
   GETRIN — Dashboard
   js/dashboard.js
   RF14: filtro de vencimento 30 / 60 / 90 dias
   ============================================================= */

let _currentDays = 30;

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('dashboard');
  await loadDashboard(_currentDays);
});

/* Carrega (ou recarrega) dados do dashboard para o período escolhido */
async function loadDashboard(days) {
  _currentDays = days;

  // Destaca o botão ativo
  document.querySelectorAll('.days-filter-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.days) === days);
  });

  try {
    const res = await fetch(`${API_BASE}/dashboard?days=${days}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Erro ao obter dados');
    const data = await res.json();
    renderMetrics(data.metrics);
    renderAlerts(data.alerts);
    renderActivity(data.recentActivity);
  } catch (err) {
    console.error('Erro no Dashboard:', err);
    showToast('Erro ao carregar dados do servidor.');
  }
}

/* Métricas */
function renderMetrics(metrics) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('metric-compliance',   metrics.compliance + '%');
  set('metric-workers',      metrics.workers);
  set('metric-expiring',     metrics.expiring);
  set('metric-noncompliant', metrics.nonCompliant);

  // Label dinâmico reflete o período filtrado
  const lbl = document.getElementById('metric-expiring-label');
  if (lbl) lbl.textContent = `Vencendo em ${metrics.expiringDays || _currentDays} dias`;
}

/* Alertas */
function renderAlerts(alerts) {
  const container = document.getElementById('alerts-list');
  if (!container) return;
  if (!alerts || !alerts.length) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:12px;">Nenhum alerta ativo.</div>';
    return;
  }
  container.innerHTML = alerts.map(a => `
    <div class="alert-item">
      <i class="ti ti-alert-triangle alert-icon"></i>
      <div class="alert-body">
        <div class="alert-name">${a.norm} — ${a.title}</div>
        <div class="alert-sub">
          ${a.count} trabalhadores vencem em
          <span class="alert-days">${a.days} dias</span>
        </div>
      </div>
      <div>${badge(a.level === 'urgent' ? 'amber' : 'gray', a.level === 'urgent' ? 'Urgente' : 'Monitorar')}</div>
    </div>`).join('');
}

/* Atividade recente */
function renderActivity(recentActivity) {
  const tbody = document.getElementById('activity-tbody');
  if (!tbody) return;
  if (!recentActivity || !recentActivity.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-3);">Nenhuma atividade recente.</td></tr>';
    return;
  }
  tbody.innerHTML = recentActivity.map(r => `
    <tr>
      <td class="td-primary">${r.name}</td>
      <td>${r.training}</td>
      <td>${nrTag(r.norm)}</td>
      <td class="td-mono">${r.date}</td>
      <td>${badge(r.status, r.statusLabel)}</td>
    </tr>`).join('');
}