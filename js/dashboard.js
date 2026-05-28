/* =============================================================
   GETRIN — Dashboard
   js/dashboard.js
   ============================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('dashboard');
  
  try {
    const res = await fetch(`${API_BASE}/dashboard`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Erro ao obter dados");
    const data = await res.json();
    
    renderMetrics(data.metrics);
    renderAlerts(data.alerts);
    renderActivity(data.recentActivity);
  } catch (err) {
    console.error("Erro no Dashboard:", err);
    showToast("Erro ao carregar dados do servidor.");
  }
});

/* Métricas */
function renderMetrics(metrics) {
  document.getElementById('metric-compliance').textContent  = metrics.compliance + '%';
  document.getElementById('metric-workers').textContent     = metrics.workers;
  document.getElementById('metric-expiring').textContent    = metrics.expiring;
  document.getElementById('metric-noncompliant').textContent= metrics.nonCompliant;
}

/* Alertas */
function renderAlerts(alerts) {
  const container = document.getElementById('alerts-list');
  if (!container) return;
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
  tbody.innerHTML = recentActivity.map(r => `
    <tr>
      <td class="td-primary">${r.name}</td>
      <td>${r.training}</td>
      <td>${nrTag(r.norm)}</td>
      <td class="td-mono">${r.date}</td>
      <td>${badge(r.status, r.statusLabel)}</td>
    </tr>`).join('');
}
