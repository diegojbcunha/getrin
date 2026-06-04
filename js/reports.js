/* =============================================================
   GETRIN — Relatórios
   js/reports.js
   RF18: filtros reais (setor/função/norma) + exportação PDF e Excel
   ============================================================= */

/* Dados carregados globalmente — usados pelas funções de exportação */
let _reportData = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('reports');
  await loadReports();
});

/* ─── Carregamento de dados ──────────────────────────────────── */

async function loadReports(sector = '', role = '', norm = '') {
  try {
    const params = new URLSearchParams();
    if (sector) params.set('sector', sector);
    if (role)   params.set('role',   role);
    if (norm)   params.set('norm',   norm);

    const endpoint = `/reports${params.toString() ? '?' + params : ''}`;
    const data = await fetchWithFallback(endpoint, {}, Data);
    _reportData = data;

    renderSummaryMetrics(data.summary);
    renderDeptChart(data.departments);
    renderNormTable(data.normCompliance);
    renderWorkerTable(data.reportWorkers);
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar dados de relatórios.');
  }
}

/* ─── Renderização ───────────────────────────────────────────── */

function renderSummaryMetrics(summary) {
  if (!summary) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('summary-avg',   (summary.avgCompliance || 0) + '%');
  set('summary-conf',  summary.conformes      || 0);
  set('summary-risco', summary.emRisco        || 0);
  set('summary-nconf', summary.naoConformes   || 0);
}

function renderDeptChart(departments) {
  const container = document.getElementById('dept-chart');
  if (!container || !departments) return;
  container.innerHTML = departments.map(d => {
    const h     = Math.round((d.pct / 100) * 75);
    const color = d.pct >= 90 ? 'var(--green-600)' : d.pct >= 75 ? 'var(--accent)' : 'var(--amber-600)';
    const short = d.name.length > 8 ? d.name.substring(0, 8) + '.' : d.name;
    return `
    <div class="bar-col">
      <span class="bar-col-pct">${d.pct}%</span>
      <div class="bar-col-bar" style="height:${h}px;background:${color};opacity:0.85;"></div>
      <span class="bar-col-label">${short}</span>
    </div>`;
  }).join('');
}

function renderNormTable(normCompliance) {
  const tbody = document.getElementById('norm-tbody');
  if (!tbody || !normCompliance) return;
  tbody.innerHTML = normCompliance.map(n => `
    <tr>
      <td>${nrTag(n.norm)}</td>
      <td>${progressBar(n.pct)}</td>
      <td class="td-mono c-green">${n.valid}</td>
      <td class="td-mono c-danger">${n.expired}</td>
    </tr>`).join('');
}

function renderWorkerTable(reportWorkers) {
  const tbody = document.getElementById('report-workers-tbody');
  if (!tbody || !reportWorkers) return;
  const count = document.getElementById('workers-count');
  if (count) count.textContent = reportWorkers.length + ' registros';
  tbody.innerHTML = reportWorkers.map(w => `
    <tr>
      <td class="td-primary">${w.name}</td>
      <td>${w.sector}</td>
      <td>${w.role}</td>
      <td class="td-mono c-green">${w.valid}</td>
      <td class="td-mono c-danger">${w.expired}</td>
      <td>${progressBar(w.pct)}</td>
      <td>${badge(w.status, w.statusLabel || w.status_label)}</td>
    </tr>`).join('');
}

/* ─── Filtros ────────────────────────────────────────────────── */

function filterBySector(val) {
  loadReports(val,
    document.getElementById('filter-role')?.value || '',
    document.getElementById('filter-norm')?.value || '');
}

function filterByRole(val) {
  loadReports(
    document.getElementById('filter-sector')?.value || '',
    val,
    document.getElementById('filter-norm')?.value   || '');
}

function filterByNorm(val) {
  loadReports(
    document.getElementById('filter-sector')?.value || '',
    document.getElementById('filter-role')?.value   || '',
    val);
}

function clearFilters() {
  ['filter-sector', 'filter-role', 'filter-norm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  loadReports();
}

/* ─── Exportação PDF (RF18) ──────────────────────────────────── */

function exportPDF() {
  if (!_reportData) { showToast('Aguarde o carregamento dos dados.'); return; }

  const now     = new Date().toLocaleDateString('pt-BR');
  const workers = _reportData.reportWorkers || [];
  const summary = _reportData.summary || {};
  const STATUS  = { green: 'Conforme', amber: 'Em risco', red: 'Não conforme', gray: 'Pendente' };

  const rows = workers.map(w => `
    <tr>
      <td>${w.name}</td><td>${w.sector}</td><td>${w.role}</td>
      <td style="text-align:center">${w.valid}</td>
      <td style="text-align:center">${w.expired}</td>
      <td style="text-align:center">${w.pct}%</td>
      <td style="text-align:center">${STATUS[w.status] || w.status}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"/>
    <title>Relatório Getrin — ${now}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px}
      h1{font-size:16px;font-weight:bold;margin-bottom:4px}
      .meta{font-size:10px;color:#666;margin-bottom:20px}
      .summary{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
      .sum{border:1px solid #ddd;border-radius:4px;padding:8px 14px;min-width:90px}
      .sum-num{font-size:18px;font-weight:bold}
      .sum-lbl{font-size:9px;color:#666;margin-top:2px}
      table{width:100%;border-collapse:collapse}
      th{background:#f4f4f4;font-weight:bold;text-align:left;padding:6px 8px;border-bottom:1px solid #ccc;font-size:10px}
      td{padding:5px 8px;border-bottom:1px solid #eee}
      tr:nth-child(even){background:#fafafa}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>Relatório de Conformidade — Getrin</h1>
    <div class="meta">Gerado em ${now} · ${workers.length} trabalhadores</div>
    <div class="summary">
      <div class="sum"><div class="sum-num">${summary.avgCompliance || 0}%</div><div class="sum-lbl">Conformidade</div></div>
      <div class="sum"><div class="sum-num">${summary.conformes || 0}</div><div class="sum-lbl">Conformes</div></div>
      <div class="sum"><div class="sum-num">${summary.emRisco || 0}</div><div class="sum-lbl">Em risco</div></div>
      <div class="sum"><div class="sum-num">${summary.naoConformes || 0}</div><div class="sum-lbl">Não conformes</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Trabalhador</th><th>Setor</th><th>Função</th>
        <th style="text-align:center">Válidos</th>
        <th style="text-align:center">Vencidos</th>
        <th style="text-align:center">Conformidade</th>
        <th style="text-align:center">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) { showToast('Permita pop-ups para exportar o PDF.'); return; }
  win.document.write(html);
  win.document.close();
}

/* ─── Exportação Excel / XLSX (RF18) ─────────────────────────── */

function exportXLSX() {
  if (!_reportData) { showToast('Aguarde o carregamento dos dados.'); return; }
  if (typeof XLSX !== 'undefined') { _doExportXLSX(); return; }

  // Carrega SheetJS via CDN na primeira chamada
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  script.onload  = () => _doExportXLSX();
  script.onerror = () => showToast('Erro ao carregar biblioteca de exportação.');
  document.head.appendChild(script);
}

function _doExportXLSX() {
  try {
    const workers = _reportData.reportWorkers || [];
    const summary = _reportData.summary       || {};
    const norms   = _reportData.normCompliance || [];
    const depts   = _reportData.departments   || [];
    const now     = new Date().toLocaleDateString('pt-BR');
    const STATUS  = { green: 'Conforme', amber: 'Em risco', red: 'Não conforme', gray: 'Pendente' };

    /* Aba 1 — Trabalhadores */
    const wsW = XLSX.utils.aoa_to_sheet([
      [`Relatório Getrin — ${now}`], [],
      ['Trabalhador','Setor','Função','Válidos','Vencidos','Conformidade (%)','Status'],
      ...workers.map(w => [w.name, w.sector, w.role, w.valid, w.expired, w.pct, STATUS[w.status] || w.status]),
    ]);

    /* Aba 2 — Por setor */
    const wsD = XLSX.utils.aoa_to_sheet([
      ['Setor','Conformidade (%)'],
      ...depts.map(d => [d.name, d.pct]),
    ]);

    /* Aba 3 — Por norma */
    const wsN = XLSX.utils.aoa_to_sheet([
      ['Norma','Conformidade (%)','Válidos','Vencidos'],
      ...norms.map(n => [n.norm, n.pct, n.valid, n.expired]),
    ]);

    /* Aba 4 — Resumo */
    const wsS = XLSX.utils.aoa_to_sheet([
      ['Indicador','Valor'],
      ['Total de trabalhadores', summary.totalWorkers   || 0],
      ['Conformidade média (%)', summary.avgCompliance  || 0],
      ['Conformes',              summary.conformes      || 0],
      ['Em risco',               summary.emRisco        || 0],
      ['Não conformes',          summary.naoConformes   || 0],
      ['Data de geração',        now],
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsW, 'Trabalhadores');
    XLSX.utils.book_append_sheet(wb, wsD, 'Por Setor');
    XLSX.utils.book_append_sheet(wb, wsN, 'Por Norma');
    XLSX.utils.book_append_sheet(wb, wsS, 'Resumo');

    const filename = `getrin-relatorio-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast('Planilha exportada com sucesso!');
  } catch (err) {
    console.error('Erro na exportação XLSX:', err);
    showToast('Erro ao gerar a planilha.');
  }
}