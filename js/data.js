/* =============================================================
   GETRIN — Dados compartilhados e utilitários
   js/data.js
   Carregue este arquivo em TODAS as páginas, antes dos outros JS.
   ============================================================= */

/* ---------------------------------------------------------------
   API E FALLBACK
   --------------------------------------------------------------- */
const API_BASE = `${location.origin}/api`;

/* ---------------------------------------------------------------
   INDEXEDDB — Armazenamento Offline
   --------------------------------------------------------------- */
const DB_NAME = 'GetrinDB';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'endpoint' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getLocalCache(endpoint) {
  try {
    const db = await openDB();
    const tx = db.transaction('cache', 'readonly');
    const store = tx.objectStore('cache');
    return new Promise((resolve) => {
      const request = store.get(endpoint);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

async function setLocalCache(endpoint, data) {
  try {
    const db = await openDB();
    const tx = db.transaction('cache', 'readwrite');
    const store = tx.objectStore('cache');
    store.put({ endpoint, data, updated_at: new Date().toISOString() });
  } catch (_) { /* ignore */ }
}

/**
 * Tenta buscar dados do servidor. Se falhar, retorna os dados locais (IndexedDB).
 */
async function fetchWithFallback(endpoint, options = {}, localData = null) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { ...getAuthHeaders(), ...options.headers }
    });
    if (!res.ok) throw new Error(`Erro na API: ${res.status}`);
    const data = await res.json();
    
    // Salva no cache local para uso offline
    if (options.method === 'GET' || !options.method) {
      await setLocalCache(endpoint, data);
    }
    
    return data;
  } catch (err) {
    console.warn(`Fallback para cache local no endpoint ${endpoint}:`, err.message);
    
    // Tenta obter do IndexedDB
    const cached = await getLocalCache(endpoint);
    if (cached) return cached;

    if (localData !== null) return localData;
    throw err;
  }
}

/* ---------------------------------------------------------------
   ESTADO GLOBAL (salvo em sessionStorage para navegar entre páginas)
   --------------------------------------------------------------- */
const State = {
  // Autenticação
  get token()           { return sessionStorage.getItem('getrin_token')        || ''; },
  set token(v)          { sessionStorage.setItem('getrin_token', v); },

  get loginRole()       { return sessionStorage.getItem('getrin_loginRole')    || 'admin'; },
  set loginRole(v)      { sessionStorage.setItem('getrin_loginRole', v); },

  get currentName()     { return sessionStorage.getItem('getrin_name')         || ''; },
  set currentName(v)    { sessionStorage.setItem('getrin_name', v); },

  get currentInitials() { return sessionStorage.getItem('getrin_initials')     || ''; },
  set currentInitials(v){ sessionStorage.setItem('getrin_initials', v); },

  get currentRole()     { return sessionStorage.getItem('getrin_role')         || ''; },
  set currentRole(v)    { sessionStorage.setItem('getrin_role', v); },

  /* ID do trabalhador selecionado para abrir o perfil */
  get selectedWorker()  { return sessionStorage.getItem('getrin_worker')       || ''; },
  set selectedWorker(v) { sessionStorage.setItem('getrin_worker', v); },

  /* Limpar tudo na sessão (logout) */
  clear() {
    ['getrin_token','getrin_loginRole','getrin_name','getrin_initials',
     'getrin_role','getrin_worker'].forEach(k => sessionStorage.removeItem(k));
  }
};

/* ---------------------------------------------------------------
   AUTENTICAÇÃO — Guard e Headers
   --------------------------------------------------------------- */

/**
 * Retorna os headers HTTP com o token de autenticação.
 * Use em todos os fetch() das páginas internas.
 */
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${State.token}`
  };
}

/**
 * Formata uma data (YYYY-MM-DD ou Date object) para formato amigável (DD/MM/YYYY ou DD Mon YYYY).
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr + 'T00:00:00') : dateStr;
    if (isNaN(date.getTime())) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (_) {
    return '—';
  }
}

/**
 * Protege páginas internas: se não há token, redireciona para o login.
 * Chame no topo do DOMContentLoaded de cada página interna.
 */
function authGuard() {
  if (!State.token) {
    window.location.href = '/html/login.html';
    return false;
  }
  return true;
}

/**
 * Realiza logout: limpa a sessão e redireciona para o login.
 */
async function doLogout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (_) { /* ignora erros de rede no logout */ }
  State.clear();
  window.location.href = '/html/login.html';
}

/* ---------------------------------------------------------------
   CATÁLOGO DE TREINAMENTOS (Agora via API/Supabase)
   --------------------------------------------------------------- */
const Trainings = []; // Mantido vazio para compatibilidade se algum script antigo referenciar

/* ---------------------------------------------------------------
   TRABALHADORES (Agora via API/Supabase)
   --------------------------------------------------------------- */
const Workers = []; // Mantido vazio para compatibilidade se algum script antigo referenciar

/* ---------------------------------------------------------------
   OUTROS DADOS DO SISTEMA (Fallback vazio)
   --------------------------------------------------------------- */
const Data = {
  metrics: { compliance: 0, workers: 0, expiring: 0, nonCompliant: 0 },
  alerts: [],
  recentActivity: [],
  departments: [],
  normCompliance: [],
  reportWorkers: [],
  summary: { avgCompliance: 0, conformes: 0, emRisco: 0, naoConformes: 0, totalWorkers: 0 },
  portalTrainings: { pending: [], completed: [] },
};

/* ---------------------------------------------------------------
   HELPERS DE RENDERIZAÇÃO
   --------------------------------------------------------------- */
function badge(cls, label) {
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function nrTag(norm) {
  return `<span class="nr-tag">${norm}</span>`;
}

function progressBar(pct, forceRed = false) {
  const bg    = forceRed ? 'var(--red-600)' : 'var(--blue-400)';
  const label = forceRed
    ? `<span class="progress-pct" style="color:var(--red-600)">Exp</span>`
    : `<span class="progress-pct">${pct}%</span>`;
  return `
    <div class="progress-wrap">
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%;background:${bg}"></div>
      </div>
      ${label}
    </div>`;
}

/* ---------------------------------------------------------------
   PWA — Instalação
   --------------------------------------------------------------- */
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Impede que o mini-infobar apareça no mobile
  e.preventDefault();
  // Guarda o evento para ser disparado depois
  deferredPrompt = e;
  // Mostra o botão de instalação se ele existir no DOM
  const btn = document.getElementById('install-pwa-btn');
  if (btn) btn.style.display = 'flex';
  
  const banner = document.getElementById('dashboard-install-banner');
  if (banner) banner.style.display = 'flex';
});

async function installPWA() {
  if (!deferredPrompt) return;
  // Mostra o prompt de instalação
  deferredPrompt.prompt();
  // Aguarda a resposta do usuário
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`Usuário escolheu instalação: ${outcome}`);
  // Limpa o prompt
  deferredPrompt = null;
  // Esconde os botões
  const btn = document.getElementById('install-pwa-btn');
  if (btn) btn.style.display = 'none';
  
  const banner = document.getElementById('dashboard-install-banner');
  if (banner) banner.style.display = 'none';
}

/* ---------------------------------------------------------------
   SIDEBAR
   --------------------------------------------------------------- */
function renderSidebar(activePage, workerMode = false) {
  const name     = State.currentName;
  const initials = State.currentInitials;
  const role     = State.currentRole;

  // Botão de instalação (só aparece se o PWA for instalável)
  const installBtn = `
    <div id="install-pwa-btn" class="sidebar-install-box" onclick="installPWA()" role="button" aria-label="Instalar aplicativo">
      <i class="ti ti-download"></i>
      <span>Instalar Aplicativo</span>
    </div>
  `;

  if (workerMode) {
    return `
    <div class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-wrap">
          <div class="logo-text"><span class="logo-g">g</span><span class="logo-etrin">etrin</span></div>
          <div class="logo-pip"></div>
        </div>
        <div class="logo-sub">Portal do trabalhador</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">Minha área</div>
        <a href="/html/portal.html"   class="nav-item ${activePage==='portal'?'active':''}"><i class="ti ti-layout-dashboard"></i>Meus treinamentos</a>
        <a href="#" class="nav-item" onclick="showToast('Certificados em breve.');return false;"><i class="ti ti-certificate"></i>Certificados</a>
        <a href="#" class="nav-item" onclick="showToast('Sem novas notificações.');return false;"><i class="ti ti-bell"></i>Notificações</a>
      </div>
      <div class="sidebar-footer">
        ${installBtn}
        <div class="user-row">
          <div class="user-avatar">${initials}</div>
          <div>
            <div class="user-info-name">${name}</div>
            <div class="user-info-role">${role}</div>
          </div>
          <a href="#" class="ti ti-logout" title="Sair" onclick="doLogout();return false;"></a>
        </div>
      </div>
    </div>`;
  }

  const navItems = [
    { page: 'dashboard', href: '/html/dashboard.html', icon: 'ti-layout-dashboard', label: 'Dashboard'     },
    { page: 'trainings', href: '/html/trainings.html', icon: 'ti-books',             label: 'Treinamentos'  },
    { page: 'workers',   href: '/html/workers.html',   icon: 'ti-users',             label: 'Trabalhadores' },
    { page: 'alerts',    href: '/html/alerts.html',    icon: 'ti-bell',              label: 'Alertas'       },
    { page: 'reports',   href: '/html/reports.html',   icon: 'ti-chart-bar',         label: 'Relatórios'    },
  ];

  const navHtml = navItems.map(n => {
    const isHash = n.href === '#';
    const onclick = isHash ? `onclick="showToast('Tela em construção.');return false;"` : '';
    return `
    <a href="${n.href}" class="nav-item ${activePage===n.page?'active':''}" ${onclick}>
      <i class="ti ${n.icon}"></i>${n.label}
      ${n.badge ? `<span class="nav-badge">${n.badge}</span>` : ''}
    </a>`;
  }).join('');

  return `
  <div class="sidebar">
    <div class="sidebar-logo">
      <div class="logo-wrap">
        <div class="logo-text"><span class="logo-g">g</span><span class="logo-etrin">etrin(beta)</span></div>
        <div class="logo-pip"></div>
      </div>
      <div class="logo-sub">Conformidade · NR · Capacitação</div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-section-label">Gestão</div>
      ${navHtml}
    </div>
    ${State.loginRole === 'admin' ? `
    <div class="sidebar-section">
    </div>` : ''}
    <div class="sidebar-footer">
      ${installBtn}
      <div class="user-row">
        <div class="user-avatar">${initials}</div>
        <div>
          <div class="user-info-name">${name}</div>
          <div class="user-info-role">${role}</div>
        </div>
        <a href="#" class="ti ti-logout" title="Sair" onclick="doLogout();return false;"></a>
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------
   MODALS + TOAST + SIDEBAR HELPERS (injetados no body)
   --------------------------------------------------------------- */
function openModal(id)  {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('open');
    // Se é o modal de treinamento e não está em modo edição, mostra o campo de empresa
    if (id === 'modal-training' && !el.dataset.trainingId) {
      const companyField = el.querySelector('#training-company')?.closest('.form-field');
      if (companyField) companyField.style.display = 'block';
    }
    if (id === 'modal-training') {
      populateCompanySelect();
    }
  }
}
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }
function submitModal(id, msg) { closeModal(id); showToast(msg); }

// Toggle do Menu Mobile
function toggleMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  }
}

let _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  const m = document.getElementById('toast-msg');
  if (!t || !m) return;
  m.textContent = msg;
  t.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function injectSharedHTML() {
  // Não injeta se já foi injetado
  if (document.getElementById('modal-training')) {
    return;
  }

  // Adiciona overlay do sidebar para mobile
  if (!document.querySelector('.sidebar-overlay')) {
    document.body.insertAdjacentHTML('beforeend', '<div class="sidebar-overlay" onclick="toggleMobileMenu()"></div>');
  }

  // Injeta botão de menu mobile na topbar automaticamente
  const topbarLeft = document.querySelector('.topbar-left');
  if (topbarLeft && !document.querySelector('.menu-toggle')) {
    topbarLeft.insertAdjacentHTML('afterbegin', `
      <div class="menu-toggle" onclick="toggleMobileMenu()" style="display:none;">
        <i class="ti ti-menu-2"></i>
      </div>
    `);
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="toast" id="toast">
      <i class="ti ti-check"></i>
      <span id="toast-msg">Ação realizada com sucesso.</span>
    </div>

    <div class="modal-overlay" id="modal-training">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title" id="modal-training-title">Novo treinamento</span>
          <i class="ti ti-x modal-close" onclick="closeModal('modal-training'); resetTrainingModal();"></i>
        </div>
        <div class="modal-body">
          <div class="form-field">
            <label class="form-label">Nome do treinamento</label>
            <input class="form-input" id="training-name" placeholder="Ex: Segurança em instalações elétricas" />
          </div>
          <div class="form-grid-2">
            <div class="form-field">
              <label class="form-label">Empresa</label>
              <select class="form-select" id="training-company">
                <option value="">Carregando empresas...</option>
              </select>
            </div>
            <div class="form-field">
              <label class="form-label">Norma regulamentadora</label>
              <select class="form-select" id="training-norm"><option>NR-10</option><option>NR-12</option><option>NR-35</option><option>NR-07</option><option>NR-23</option><option>NR-33</option></select>
            </div>
          </div>
          <div class="form-grid-2">
            <div class="form-field">
              <label class="form-label">Carga horária</label>
              <input class="form-input" id="training-hours" placeholder="Ex: 40h" />
            </div>
            <div class="form-field">
              <label class="form-label">Validade</label>
              <select class="form-select" id="training-validity"><option>6 meses</option><option>1 ano</option><option>2 anos</option></select>
            </div>
          </div>
          <div class="form-grid-2">
            <div class="form-field">
              <label class="form-label">Modalidade</label>
              <select class="form-select" id="training-mode"><option>Presencial</option><option>EAD</option><option>Híbrido</option></select>
            </div>
            <div class="form-field">
              <label class="form-label">Funções designadas</label>
              <input class="form-input" id="training-roles" placeholder="Ex: Eletricista, Manutenção" />
            </div>
          </div>
          <div class="form-field">
            <label class="form-label">E-mail do funcionário (opcional)</label>
            <input class="form-input" id="training-worker-email" type="email" placeholder="funcionario@empresa.com" />
          </div>
          <div class="form-field">
            <label class="form-label">Materiais do treinamento</label>
            <div id="training-materials-list" class="materials-editor"></div>
            <button type="button" class="btn btn-sm" onclick="addTrainingMaterialRow('youtube')">
              <i class="ti ti-brand-youtube"></i>Adicionar video
            </button>
            <button type="button" class="btn btn-sm" onclick="addTrainingMaterialRow('pdf')">
              <i class="ti ti-file-type-pdf"></i>Adicionar PDF
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="closeModal('modal-training'); resetTrainingModal();">Cancelar</button>
          <button class="btn btn-primary" id="btn-submit-training" onclick="submitTrainingModal()">Criar treinamento</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="modal-assign">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">Atribuir treinamento</span>
          <i class="ti ti-x modal-close" onclick="closeModal('modal-assign')"></i>
        </div>
        <div class="modal-body">
          <div class="form-field">
            <label class="form-label">Treinamento</label>
            <select class="form-select" id="assign-training-id"></select>
          </div>
          <div class="form-field">
            <label class="form-label">E-mail do funcionário</label>
            <input class="form-input" id="assign-worker-email" type="email" placeholder="funcionario@empresa.com" />
          </div>
          <div class="form-field">
            <label class="form-label">Prazo de conclusão</label>
            <input class="form-input" id="assign-deadline" type="date" />
          </div>
          <div class="form-field">
            <label class="form-label">Observações</label>
            <input class="form-input" id="assign-notes" placeholder="Opcional" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="closeModal('modal-assign')">Cancelar</button>
          <button class="btn btn-primary" onclick="submitAssignModal()">Atribuir</button>
        </div>
      </div>
    </div>
  `);
  addTrainingMaterialRow('youtube');
}

function addTrainingMaterialRow(type = 'youtube', material = {}) {
  const list = document.getElementById('training-materials-list');
  if (!list) return;

  const row = document.createElement('div');
  row.className = 'material-row';
  row.dataset.type = material.type || type;
  row.dataset.id = material.id || '';
  row.innerHTML = `
    <select class="form-select material-type" onchange="updateMaterialRowType(this)">
      <option value="youtube"${row.dataset.type === 'youtube' ? ' selected' : ''}>YouTube</option>
      <option value="pdf"${row.dataset.type === 'pdf' ? ' selected' : ''}>PDF</option>
    </select>
    <input class="form-input material-title" placeholder="Titulo do material" value="${material.title || ''}" />
    <input class="form-input material-url" placeholder="${row.dataset.type === 'pdf' ? 'Link do PDF ou envie um arquivo' : 'Link do video no YouTube'}" value="${material.url || ''}" />
    <input class="form-input material-file" type="file" accept="application/pdf" style="${row.dataset.type === 'pdf' ? '' : 'display:none'}" />
    <button type="button" class="btn btn-icon" onclick="this.closest('.material-row').remove()" title="Remover material">
      <i class="ti ti-trash"></i>
    </button>
  `;
  list.appendChild(row);
}

function updateMaterialRowType(select) {
  const row = select.closest('.material-row');
  if (!row) return;
  row.dataset.type = select.value;
  const file = row.querySelector('.material-file');
  const url = row.querySelector('.material-url');
  if (file) file.style.display = select.value === 'pdf' ? '' : 'none';
  if (url) url.placeholder = select.value === 'pdf' ? 'Link do PDF ou envie um arquivo' : 'Link do video no YouTube';
}

function readPdfFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (file.type !== 'application/pdf') return reject(new Error('Envie apenas arquivos PDF.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Nao foi possivel ler o PDF.'));
    reader.readAsDataURL(file);
  });
}

async function collectTrainingMaterials() {
  const rows = Array.from(document.querySelectorAll('#training-materials-list .material-row'));
  const materials = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const type = row.querySelector('.material-type')?.value || 'youtube';
    const title = row.querySelector('.material-title')?.value.trim() || '';
    const url = row.querySelector('.material-url')?.value.trim() || '';
    const file = row.querySelector('.material-file')?.files?.[0] || null;
    const pdf_data = type === 'pdf' && file ? await readPdfFile(file) : '';

    if (!title && !url && !pdf_data) continue;
    if (!title) throw new Error('Informe o titulo de todos os materiais.');
    if (!url && !pdf_data) throw new Error('Informe um link ou arquivo para cada material.');

    materials.push({ id: row.dataset.id || undefined, type, title, url, pdf_data, order: index });
  }

  return materials;
}

async function submitTrainingModal() {
  // Proteção contra submissões duplicadas
  const btn = document.getElementById('btn-submit-training');
  if (btn && btn.dataset.submitting === 'true') return;
  if (btn) btn.dataset.submitting = 'true';

  const name = document.getElementById('training-name')?.value.trim() || '';
  const norm = document.getElementById('training-norm')?.value || '';
  const hours = document.getElementById('training-hours')?.value.trim() || '';
  const validity = document.getElementById('training-validity')?.value || '';
  const mode = document.getElementById('training-mode')?.value || '';
  const roles = document.getElementById('training-roles')?.value.trim() || '';
  const worker_email = document.getElementById('training-worker-email')?.value.trim() || '';
  const company_id = document.getElementById('training-company')?.value || '';
  const trainingId = document.getElementById('modal-training')?.dataset.trainingId || null;

  if (!name || !norm || !hours || !validity || !mode) {
    showToast('Preencha os campos obrigatórios do treinamento.');
    if (btn) btn.dataset.submitting = 'false';
    return;
  }

  try {
    const method = trainingId ? 'PUT' : 'POST';
    const url = trainingId ? `${API_BASE}/trainings/${trainingId}` : `${API_BASE}/trainings`;
    const materials = await collectTrainingMaterials();
    const body = { name, norm, hours, validity, roles, mode, worker_email, materials };
    if (!trainingId && company_id) body.company_id = company_id;

    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Erro ao ${trainingId ? 'editar' : 'criar'} treinamento.`);
    }

    resetTrainingModal();
    closeModal('modal-training');
    showToast(trainingId 
      ? 'Treinamento atualizado com sucesso.' 
      : (worker_email ? 'Treinamento criado e atribuído com sucesso.' : 'Treinamento criado com sucesso.'));
    
    // Recarrega os dados de treinamentos se a página tiver a função renderTrainings
    if (typeof reloadTrainings === 'function') {
      await reloadTrainings();
    }
  } catch (error) {
    showToast(error.message || `Erro ao ${trainingId ? 'editar' : 'criar'} treinamento.`);
  } finally {
    if (btn) btn.dataset.submitting = 'false';
  }
}

/* Reseta o formulário de treinamento e limpa dados de edição */
function resetTrainingModal() {
  const modal = document.getElementById('modal-training');
  if (modal) {
    modal.dataset.trainingId = '';
    document.getElementById('modal-training-title').textContent = 'Novo treinamento';
  }
  document.getElementById('btn-submit-training').textContent = 'Criar treinamento';
  document.getElementById('training-name').value = '';
  document.getElementById('training-hours').value = '';
  document.getElementById('training-roles').value = '';
  document.getElementById('training-worker-email').value = '';
  const materialsList = document.getElementById('training-materials-list');
  if (materialsList) {
    materialsList.innerHTML = '';
    addTrainingMaterialRow('youtube');
  }
  document.getElementById('training-company').selectedIndex = 0;
  document.getElementById('training-norm').selectedIndex = 0;
  document.getElementById('training-validity').selectedIndex = 0;
  document.getElementById('training-mode').selectedIndex = 0;
  
  // Mostra o campo de empresa novamente
  const companyField = document.getElementById('training-company')?.closest('.form-field');
  if (companyField) {
    companyField.style.display = 'block';
  }
}

async function submitAssignModal() {
  const trainingId = document.getElementById('assign-training-id')?.value || '';
  const worker_email = document.getElementById('assign-worker-email')?.value.trim() || '';
  const deadline = document.getElementById('assign-deadline')?.value || '';

  if (!trainingId || !worker_email) {
    showToast('Informe o treinamento e o e-mail do funcionário.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/worker-trainings/assign`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        worker_email,
        training_id: trainingId,
        done_at: deadline || null,
        expires: deadline ? new Date(deadline) : null,
        status: 'gray',
        status_label: 'Pendente'
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atribuir treinamento.');
    }

    closeModal('modal-assign');
    showToast('Treinamento atribuído com sucesso.');
  } catch (error) {
    showToast(error.message || 'Erro ao atribuir treinamento.');
  }
}

async function populateAssignTrainingSelect() {
  const select = document.getElementById('assign-training-id');
  if (!select) return;

  try {
    const res = await fetch(`${API_BASE}/trainings`, { headers: getAuthHeaders() });
    if (!res.ok) return;

    const trainings = await res.json();
    const options = trainings.map(t => `<option value="${t.id}">${t.name} (${t.norm})</option>`).join('');
    select.innerHTML = `<option value="">Selecione...</option>${options}`;
  } catch (_) {
    // silencioso: o modal ainda funciona com opções vazias caso a API falhe
  }
}

/* Popula o select de empresas no modal de treinamento */
async function populateCompanySelect() {
  const select = document.getElementById('training-company');
  if (!select) return;

  try {
    const res = await fetch(`${API_BASE}/companies`, { headers: getAuthHeaders() });
    if (!res.ok) {
      select.innerHTML = '<option value="">Erro ao carregar empresas</option>';
      return;
    }

    const companies = await res.json();
    const options = companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    select.innerHTML = `<option value="">Selecione uma empresa...</option>${options}`;
  } catch (err) {
    console.warn('Erro ao carregar empresas:', err);
    select.innerHTML = '<option value="">Erro ao carregar empresas</option>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  injectSharedHTML();
  
  // Registro do Service Worker (PWA)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('✓ Service Worker registrado:', reg.scope))
        .catch(err => console.warn('✗ Erro ao registrar Service Worker:', err));
    });
  }
  
  // Só popula o select de atribuição se o usuário estiver logado e não estiver na página de login
  // Isso evita erros 401 desnecessários no console
  const isLoginPage = window.location.pathname.includes('login.html');
  if (State.token && !isLoginPage) {
    await populateAssignTrainingSelect();
    await populateCompanySelect();
  }
  
  // Inicializa o Tutor de Segurança IA em todas as páginas internas (exceto login)
  if (!isLoginPage) {
    if (typeof initTutor === 'function') {
      initTutor();
    } else if (!document.getElementById('tutor-script')) {
      // Carrega o script do tutor dinamicamente se não estiver presente
      const s = document.createElement('script');
      s.id = 'tutor-script';
      s.src = '/js/tutor.js';
      s.defer = true;
      s.onload = () => { if (typeof initTutor === 'function') initTutor(); };
      s.onerror = () => console.warn('Não foi possível carregar /js/tutor.js');
      document.head.appendChild(s);
    }
  }
});
/* ---------------------------------------------------------------
   TUTOR DE SEGURANÇA IA
   O script é carregado dinamicamente pelo tutor.js via injectTutor().
   Para ativar, inclua /js/tutor.js no <head> de qualquer página ou
   deixe o data.js cuidar disso automaticamente.
   --------------------------------------------------------------- */
