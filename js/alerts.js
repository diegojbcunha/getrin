/* =============================================================
   GETRIN — Alertas
   js/alerts.js
   ============================================================= */

let alertsData = [];
let activeLevel = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('alerts');
  injectSharedHTML();
  await loadAlerts();
});

/* ---- Carregar alertas do backend ---- */
async function loadAlerts() {
  const list = document.getElementById('alerts-list');
  list.innerHTML = `<div class="alerts-loading"><i class="ti ti-loader-2"></i>Carregando alertas...</div>`;

  try {
    const res = await fetch(`${API_BASE}/alerts`);
    if (!res.ok) throw new Error("Erro ao obter alertas");
    const raw = await res.json();

    // Normaliza: garante que cada alerta tem um campo 'level' calculado por 'days'
    alertsData = raw.map(a => ({
      ...a,
      level: computeLevel(a.days)
    }));

    renderMetrics();
    renderAlerts(alertsData);
  } catch (err) {
    console.error(err);
    // Fallback com dados mock para demonstração
    alertsData = getMockAlerts();
    renderMetrics();
    renderAlerts(alertsData);
  }
}

/* Calcula o nível pelo número de dias restantes */
function computeLevel(days) {
  if (days == null || days < 0) return 'expired';
  if (days <= 15)  return 'urgent';
  if (days <= 30)  return 'warning';
  return 'monitor';
}

/* Dados mock para quando o backend não estiver conectado */
function getMockAlerts() {
  return [
    { id: 1, norm: 'NR-12', title: 'Operadores de prensa — Linha B',          sector: 'Produção',        count: 14, days: 8,   level: 'urgent'  },
    { id: 2, norm: 'NR-35', title: 'Trabalho em altura — Manutenção',          sector: 'Manutenção',      count: 8,  days: 12,  level: 'urgent'  },
    { id: 3, norm: 'NR-10', title: 'Eletricistas — Infraestrutura',            sector: 'Infraestrutura',  count: 16, days: 24,  level: 'warning' },
    { id: 4, norm: 'NR-07', title: 'PCMSO — Todos os setores',                 sector: 'Administrativo',  count: 22, days: 28,  level: 'warning' },
    { id: 5, norm: 'NR-33', title: 'Espaços confinados — Turno C',             sector: 'Logística',       count: 5,  days: 45,  level: 'monitor' },
    { id: 6, norm: 'NR-13', title: 'Vasos de pressão — Caldeiraria',           sector: 'Manutenção',      count: 3,  days: 52,  level: 'monitor' },
    { id: 7, norm: 'NR-12', title: 'Operadores de guilhotina — Linha A',        sector: 'Produção',        count: 9,  days: -1,  level: 'expired' },
    { id: 8, norm: 'NR-20', title: 'Inflamáveis — Almoxarifado',               sector: 'Logística',       count: 4,  days: -8,  level: 'expired' },
  ];
}

/* ---- Renderiza os contadores de métricas ---- */
function renderMetrics() {
  document.getElementById('count-urgent').textContent  = alertsData.filter(a => a.level === 'urgent').length;
  document.getElementById('count-warning').textContent = alertsData.filter(a => a.level === 'warning').length;
  document.getElementById('count-monitor').textContent = alertsData.filter(a => a.level === 'monitor').length;
  document.getElementById('count-expired').textContent = alertsData.filter(a => a.level === 'expired').length;
}

/* ---- Renderiza os cards de alerta ---- */
function renderAlerts(list) {
  const container  = document.getElementById('alerts-list');
  const countEl    = document.getElementById('alerts-count');

  if (countEl) countEl.textContent = list.length + (list.length === 1 ? ' alerta' : ' alertas');

  if (list.length === 0) {
    container.innerHTML = `
      <div class="alerts-empty">
        <i class="ti ti-bell-off"></i>
        <p>Nenhum alerta encontrado com os filtros aplicados.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(a => {
    const icon = a.level === 'expired' ? 'ti-x'
               : a.level === 'urgent'  ? 'ti-alert-triangle'
               : a.level === 'warning' ? 'ti-clock-exclamation'
               : 'ti-eye';

    const daysLabel = a.level === 'expired'
      ? `Venceu há ${Math.abs(a.days)} dias`
      : a.days === 0 ? 'Vence hoje'
      : `${a.days} dias restantes`;

    const badgeColor = a.level === 'urgent'  ? 'red'
                     : a.level === 'warning' ? 'amber'
                     : a.level === 'monitor' ? 'blue'
                     : 'gray';

    const badgeLabel = a.level === 'urgent'  ? 'Urgente'
                     : a.level === 'warning' ? 'Atenção'
                     : a.level === 'monitor' ? 'Monitorar'
                     : 'Vencido';

    return `
    <div class="alert-card ${a.level}">
      <div class="alert-card-icon">
        <i class="ti ${icon}"></i>
      </div>
      <div class="alert-card-body">
        <div class="alert-card-title">
          ${nrTag(a.norm)} ${a.title}
        </div>
        <div class="alert-card-meta">
          <span><i class="ti ti-users"></i>${a.count} trabalhador${a.count !== 1 ? 'es' : ''}</span>
          ${a.sector ? `<span><i class="ti ti-building"></i>${a.sector}</span>` : ''}
        </div>
      </div>
      <div class="alert-card-days">${daysLabel}</div>
      <div class="alert-card-actions">
        ${badge(badgeColor, badgeLabel)}
      </div>
      <div>
        <button class="btn btn-sm btn-icon" title="Ver trabalhadores" onclick="showToast('Abrindo lista de trabalhadores afetados...')">
          <i class="ti ti-chevron-right"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

/* ---- Filtro por nível ---- */
function setLevelFilter(level, el) {
  document.querySelectorAll('.alert-filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  activeLevel = level;
  applyFilters(document.getElementById('alert-search')?.value || '');
}

/* ---- Busca em tempo real ---- */
function filterAlerts(query) {
  applyFilters(query);
}

function applyFilters(query) {
  const q = (query || '').toLowerCase();
  const filtered = alertsData.filter(a => {
    const matchLevel = activeLevel === 'all' || a.level === activeLevel;
    const matchQuery = !q
      || a.norm.toLowerCase().includes(q)
      || a.title.toLowerCase().includes(q)
      || (a.sector && a.sector.toLowerCase().includes(q));
    return matchLevel && matchQuery;
  });
  renderAlerts(filtered);
}
