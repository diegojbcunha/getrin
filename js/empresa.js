/* =============================================================
   GETRIN — Empresa
   js/empresa.js
   ============================================================= */

const EMPRESA_KEY = 'getrin_empresa';
let activeNrs = new Set();
let originalData = {};

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('empresa');
  injectSharedHTML();
  await loadDashboardStats();
  loadCompanyData();
});

/* ---- Estatísticas do anel (vindas do /api/dashboard) ---- */
async function loadDashboardStats() {
  try {
    const res = await fetch(`${API_BASE}/dashboard`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const m = data.metrics;

    const total    = m.workers || 0;
    const nconf    = m.nonCompliant || 0;
    const risco    = Math.max(0, (total - nconf - Math.round(total * (m.compliance / 100))));
    const conformes = Math.max(0, total - nconf - risco);

    document.getElementById('emp-conformes').textContent = conformes;
    document.getElementById('emp-risco').textContent     = risco;
    document.getElementById('emp-nconf').textContent     = nconf;

    // Animação do anel SVG
    const pct = m.compliance || 0;
    const circumference = 201; // 2*PI*r = 2*PI*32 ≈ 201
    const offset = circumference - (pct / 100) * circumference;
    const arc = document.getElementById('ring-arc');
    const ringLabel = document.getElementById('ring-label');
    if (arc) {
      const color = pct >= 90 ? 'var(--green-600)' : pct >= 70 ? 'var(--amber-600)' : 'var(--red-600)';
      arc.style.stroke = color;
      // Animação suave
      setTimeout(() => {
        arc.style.transition = 'stroke-dashoffset 0.8s ease';
        arc.setAttribute('stroke-dashoffset', offset);
      }, 100);
    }
    if (ringLabel) ringLabel.textContent = pct + '%';
  } catch {
    document.getElementById('ring-label').textContent = '—%';
  }
}

/* ---- Carregar dados salvos no localStorage ---- */
function loadCompanyData() {
  const stored = localStorage.getItem(EMPRESA_KEY);
  const data = stored ? JSON.parse(stored) : getDefaultData();
  originalData = JSON.parse(JSON.stringify(data));
  fillForm(data);
}

function getDefaultData() {
  return {
    razao: '', fantasia: '', cnpj: '', atividade: '',
    grau: '', fundacao: '',
    cep: '', estado: '', logradouro: '', numero: '',
    complemento: '', bairro: '', cidade: '',
    tel: '', email: '', responsavel: '',
    nrs: ['NR-07', 'NR-10', 'NR-12', 'NR-35']
  };
}

function fillForm(d) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('emp-razao',       d.razao);
  set('emp-fantasia',    d.fantasia);
  set('emp-cnpj',        d.cnpj);
  set('emp-atividade',   d.atividade);
  set('emp-grau',        d.grau);
  set('emp-fundacao',    d.fundacao);
  set('emp-cep',         d.cep);
  set('emp-estado',      d.estado);
  set('emp-logradouro',  d.logradouro);
  set('emp-numero',      d.numero);
  set('emp-complemento', d.complemento);
  set('emp-bairro',      d.bairro);
  set('emp-cidade',      d.cidade);
  set('emp-tel',         d.tel);
  set('emp-email',       d.email);
  set('emp-responsavel', d.responsavel);

  // NRs
  activeNrs = new Set(d.nrs || []);
  renderNrChips();
}

/* ---- Salvar ---- */
function saveCompany() {
  const get = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const data = {
    razao:       get('emp-razao'),
    fantasia:    get('emp-fantasia'),
    cnpj:        get('emp-cnpj'),
    atividade:   get('emp-atividade'),
    grau:        get('emp-grau'),
    fundacao:    get('emp-fundacao'),
    cep:         get('emp-cep'),
    estado:      get('emp-estado'),
    logradouro:  get('emp-logradouro'),
    numero:      get('emp-numero'),
    complemento: get('emp-complemento'),
    bairro:      get('emp-bairro'),
    cidade:      get('emp-cidade'),
    tel:         get('emp-tel'),
    email:       get('emp-email'),
    responsavel: get('emp-responsavel'),
    nrs:         [...activeNrs],
  };

  if (!data.razao) { showToast('Informe a razão social da empresa.'); return; }
  if (!data.cnpj)  { showToast('Informe o CNPJ da empresa.'); return; }

  localStorage.setItem(EMPRESA_KEY, JSON.stringify(data));
  originalData = JSON.parse(JSON.stringify(data));
  showToast('Dados da empresa salvos com sucesso!');
}

/* ---- Cancelar ---- */
function cancelEdit() {
  fillForm(originalData);
  showToast('Alterações descartadas.');
}

/* ---- NRs ---- */
function addNr() {
  const sel = document.getElementById('nr-select');
  const val = sel.value;
  if (!val) return;
  if (activeNrs.has(val)) { showToast(`${val} já está na lista.`); sel.value = ''; return; }
  activeNrs.add(val);
  renderNrChips();
  sel.value = '';
}

function removeNr(nr) {
  activeNrs.delete(nr);
  renderNrChips();
}

function renderNrChips() {
  const container = document.getElementById('nr-chips');
  if (!container) return;
  const sorted = [...activeNrs].sort();
  if (sorted.length === 0) {
    container.innerHTML = `<span style="font-size:11.5px;color:var(--text-3);font-style:italic;">Nenhuma NR adicionada.</span>`;
    return;
  }
  container.innerHTML = sorted.map(nr => `
    <span class="nr-chip">
      ${nr}
      <span class="nr-chip-remove" onclick="removeNr('${nr}')" title="Remover">&times;</span>
    </span>`).join('');
}

/* ---- Preview de logo ---- */
function previewLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Imagem muito grande. Máx. 2 MB.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('logo-preview');
    preview.innerHTML = `<img src="${e.target.result}" alt="Logo" />`;
  };
  reader.readAsDataURL(file);
}

/* ---- Máscaras de input ---- */
function maskCnpj(el) {
  let v = el.value.replace(/\D/g, '').substring(0, 14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2');
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
  v = v.replace(/(\d{4})(\d)/, '$1-$2');
  el.value = v;
}

function maskCep(el) {
  let v = el.value.replace(/\D/g, '').substring(0, 8);
  if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
  el.value = v;
}

function maskTel(el) {
  let v = el.value.replace(/\D/g, '').substring(0, 11);
  if (v.length > 10) {
    v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  } else {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
  }
  el.value = v;
}
