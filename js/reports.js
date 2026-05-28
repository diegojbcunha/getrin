/* =============================================================
   GETRIN — Relatórios
   js/reports.js
   ============================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('reports');
  try {
    const res = await fetch(`${API_BASE}/reports`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Erro ao obter dados de relatórios");
    const data = await res.json();
    
    renderDeptChart(data.departments);
    renderNormTable(data.normCompliance);
    renderWorkerTable(data.reportWorkers);
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar dados de relatórios.");
  }
});

/* Gráfico de barras por setor */
function renderDeptChart(departments) {
  const container = document.getElementById('dept-chart');
  if (!container) return;
  container.innerHTML = departments.map(d => {
    const h     = Math.round((d.pct / 100) * 75);
    const color = d.pct >= 90 ? 'var(--green-600)'
                : d.pct >= 75 ? 'var(--accent)'
                : 'var(--amber-600)';
    const short = d.name.length > 8 ? d.name.substring(0, 8) + '.' : d.name;
    return `
    <div class="bar-col">
      <span class="bar-col-pct">${d.pct}%</span>
      <div class="bar-col-bar" style="height:${h}px;background:${color};opacity:0.85;"></div>
      <span class="bar-col-label">${short}</span>
    </div>`;
  }).join('');
}

/* Tabela por norma */
function renderNormTable(normCompliance) {
  const tbody = document.getElementById('norm-tbody');
  if (!tbody) return;
  tbody.innerHTML = normCompliance.map(n => `
    <tr>
      <td>${nrTag(n.norm)}</td>
      <td>${progressBar(n.pct)}</td>
      <td class="td-mono c-green">${n.valid}</td>
      <td class="td-mono c-danger">${n.expired}</td>
    </tr>`).join('');
}

/* Tabela detalhada por trabalhador */
function renderWorkerTable(reportWorkers) {
  const tbody = document.getElementById('report-workers-tbody');
  if (!tbody) return;
  tbody.innerHTML = reportWorkers.map(w => `
    <tr>
      <td class="td-primary">${w.name}</td>
      <td>${w.sector}</td>
      <td>${w.role}</td>
      <td class="td-mono c-green">${w.valid}</td>
      <td class="td-mono c-danger">${w.expired}</td>
      <td>${progressBar(w.pct)}</td>
      <td>${badge(w.status, w.status_label || w.statusLabel)}</td>
    </tr>`).join('');
}
