/* =============================================================
   GETRIN — Lista de Trabalhadores
   js/workers.js
   ============================================================= */

let workersData = [];
let filteredWorkers = [];
let sortField = null;
let sortDir   = 'asc';

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('workers');
  await initWorkers();
});

/**
 * Carrega a lista de trabalhadores vinculados
 */
async function loadWorkers() {
  try {
    workersData = await fetchWithFallback('/workers', {}, []);
    filteredWorkers = [...workersData];
    renderWorkerStats();
    renderWorkerTable(filteredWorkers);
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar trabalhadores.");
  }
}

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
  window.location.href = '/html/profile.html';
}

let _availableUsers = [];

/**
 * Inicializa a página de trabalhadores
 */
async function initWorkers() {
  await loadWorkers();
  await loadAvailableUsers(); // Carrega usuários que podem ser transformados em workers
}

/**
 * Busca usuários da users_profile que ainda não são workers
 */
async function loadAvailableUsers() {
  const select = document.getElementById('new-worker-user-id');
  if (!select) return;

  try {
    const data = await fetchWithFallback('/workers/available-users', {}, []);
    _availableUsers = data;

    if (data.length === 0) {
      select.innerHTML = '<option value="">Nenhum usuário disponível</option>';
      return;
    }

    select.innerHTML = '<option value="">Selecione um usuário...</option>' + 
      data.map(u => `<option value="${u.id}">${u.name} (${u.id.substring(0,8)}...)</option>`).join('');
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
    select.innerHTML = '<option value="">Erro ao carregar</option>';
  }
}

/**
 * Cadastrar novo trabalhador
 */
async function submitNewWorker() {
  const userId = document.getElementById('new-worker-user-id')?.value;
  const matricula = document.getElementById('new-worker-matricula')?.value.trim() || 'Aguardando';
  const role = document.getElementById('new-worker-role')?.value.trim() || '';
  const sector = document.getElementById('new-worker-sector')?.value || '';
  const manager = document.getElementById('new-worker-manager')?.value.trim() || '';
  const admission = document.getElementById('new-worker-admission')?.value || '';
  const phone = document.getElementById('new-worker-phone')?.value.trim() || '';
  const email = document.getElementById('new-worker-email')?.value.trim() || '';

  if (!userId) {
    showToast('Selecione um usuário para vincular.');
    return;
  }
  if (!role || !sector) {
    showToast('Informe a função e o setor.');
    return;
  }

  // Encontra o nome do usuário selecionado para enviar ao backend
  const selectedUser = _availableUsers.find(u => u.id === userId);
  const name = selectedUser ? selectedUser.name : 'Novo Trabalhador';

  try {
    const res = await fetch(`${API_BASE}/workers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        id: userId, // ID da users_profile
        name,
        initials: name.split(' ').map(p => p[0].toUpperCase()).slice(0, 2).join(''),
        matricula,
        role,
        sector,
        manager,
        admission,
        phone,
        email
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao cadastrar');
    }

    showToast('Trabalhador vinculado com sucesso!');
    closeModal('modal-new-worker');
    // Tenta recarregar se as funções existirem, caso contrário usa o fallback
    if (typeof loadWorkers === 'function') {
      await loadWorkers();
      await loadAvailableUsers();
    } else {
      window.location.reload();
    }
  } catch (err) {
    showToast(err.message);
  }
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