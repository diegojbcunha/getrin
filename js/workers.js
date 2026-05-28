/* =============================================================
   GETRIN — Lista de Trabalhadores
   js/workers.js
   ============================================================= */

let workersData = [];
let filteredWorkers = [];
let sortField = null;
let sortDir   = 'asc';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('workers');
  try {
    const res = await fetch(`${API_BASE}/workers`);
    if (!res.ok) throw new Error("Erro ao obter trabalhadores");
    workersData = await res.json();
    filteredWorkers = [...workersData];
    renderWorkerStats();
    renderWorkerTable(filteredWorkers);
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar trabalhadores.");
  }
});

/* ---- Métricas resumidas ---- */
function renderWorkerStats() {
  document.getElementById('stat-total').textContent    = workersData.length;
  document.getElementById('stat-conformes').textContent = workersData.filter(w => w.status === 'green').length;
  document.getElementById('stat-risco').textContent    = workersData.filter(w => w.status === 'amber').length;
  document.getElementById('stat-nconf').textContent    = workersData.filter(w => w.status === 'red').length;
}

/* ---- Tabela ---- */
function renderWorkerTable(list) {
  const tbody = document.getElementById('workers-tbody');
  const count = document.getElementById('workers-count');
  if (count) count.textContent = list.length + ' trabalhadores';

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:28px 14px;color:var(--text-3);font-size:12px;">
          Nenhum trabalhador encontrado com os filtros aplicados.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = list.map(w => {
    const barColor = w.status === 'green' ? 'var(--green-600)'
                   : w.status === 'amber' ? 'var(--amber-600)'
                   : 'var(--red-600)';
    return `
    <tr style="cursor:pointer;" onclick="openWorker('${w.id}')">
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="worker-avatar">${w.initials}</div>
          <div>
            <div style="font-weight:500;font-size:12.5px;color:var(--text);">${w.name}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-3);">${w.matricula}</div>
          </div>
        </div>
      </td>
      <td>${w.role}</td>
      <td>${w.sector}</td>
      <td>${w.manager || ''}</td>
      <td>
        <div class="progress-wrap">
          <div class="progress-track">
            <div class="progress-fill" style="width:${w.compliance}%;background:${barColor};"></div>
          </div>
          <span class="progress-pct">${w.compliance}%</span>
        </div>
      </td>
      <td>${badge(w.status, w.status_label || w.statusLabel)}</td>
      <td style="text-align:center;">
        <button class="btn btn-sm btn-icon" onclick="event.stopPropagation();openWorker('${w.id}')">
          <i class="ti ti-chevron-right"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

/* Navega para o perfil do trabalhador */
function openWorker(id) {
  State.selectedWorker = id;
  window.location.href = 'profile.html';
}

/* ---- Busca em tempo real ---- */
function filterWorkers(query) {
  applyFilters(query, getActiveStatusFilter());
}

/* ---- Filtro de status ---- */
function setStatusFilter(status, el) {
  document.querySelectorAll('.status-filter-btn').forEach(b => {
    b.classList.remove('active', 'active-green', 'active-amber', 'active-red');
  });
  el.classList.add('active');
  if (status === 'green') el.classList.add('active-green');
  if (status === 'amber') el.classList.add('active-amber');
  if (status === 'red')   el.classList.add('active-red');

  applyFilters(document.getElementById('worker-search').value, status);
}

function getActiveStatusFilter() {
  const active = document.querySelector('.status-filter-btn.active');
  return active ? active.dataset.status : 'all';
}

function applyFilters(query, status) {
  const q = (query || '').toLowerCase();
  filteredWorkers = workersData.filter(w => {
    const matchQuery = !q
      || w.name.toLowerCase().includes(q)
      || w.role.toLowerCase().includes(q)
      || w.sector.toLowerCase().includes(q)
      || w.matricula.toLowerCase().includes(q);
    const matchStatus = !status || status === 'all' || w.status === status;
    return matchQuery && matchStatus;
  });
  renderWorkerTable(filteredWorkers);
}

/* ---- Ordenação ---- */
function sortBy(field) {
  sortDir   = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
  sortField = field;

  filteredWorkers.sort((a, b) => {
    let va = a[field], vb = b[field];
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  document.querySelectorAll('.sort-icon').forEach(el => el.className = 'sort-icon ti ti-selector');
  const icon = document.getElementById('sort-' + field);
  if (icon) icon.className = `sort-icon ti ${sortDir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'}`;

  renderWorkerTable(filteredWorkers);
}