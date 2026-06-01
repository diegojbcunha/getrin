/* =============================================================
   GETRIN — Dados compartilhados e utilitários
   js/data.js
   Carregue este arquivo em TODAS as páginas, antes dos outros JS.
   ============================================================= */

/* ---------------------------------------------------------------
   CONFIGURAÇÃO DA API
   Relativa ao host — funciona tanto via Express (porta 3003)
   quanto aberto diretamente no navegador (fallback para localhost).
   --------------------------------------------------------------- */
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? `http://${location.hostname}:3003/api`
  : '/api';

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
   CATÁLOGO DE TREINAMENTOS
   --------------------------------------------------------------- */
const Trainings = [
  { id: 't01', name: 'Segurança em instalações elétricas', norm: 'NR-10', hours: '40h', validity: '2 anos', roles: 'Eletricista, Manut.', mode: 'Presencial', status: 'green', statusLabel: 'Ativo'         },
  { id: 't02', name: 'Máquinas e equipamentos',            norm: 'NR-12', hours: '16h', validity: '1 ano',  roles: 'Operador, Técnico',   mode: 'EAD',        status: 'green', statusLabel: 'Ativo'         },
  { id: 't03', name: 'Trabalho em altura',                 norm: 'NR-35', hours: '8h',  validity: '2 anos', roles: 'Manut., Construção',  mode: 'Híbrido',    status: 'green', statusLabel: 'Ativo'         },
  { id: 't04', name: 'Primeiros socorros e emergências',   norm: 'NR-07', hours: '8h',  validity: '1 ano',  roles: 'Todos colaboradores', mode: 'EAD',        status: 'amber', statusLabel: 'Em revisão'    },
  { id: 't05', name: 'Espaço confinado',                   norm: 'NR-33', hours: '16h', validity: '1 ano',  roles: 'Manutenção',          mode: 'Presencial', status: 'green', statusLabel: 'Ativo'         },
  { id: 't06', name: 'Proteção contra incêndio',           norm: 'NR-23', hours: '4h',  validity: '2 anos', roles: 'Brigada de incêndio', mode: 'EAD',        status: 'red',   statusLabel: 'Descontinuado' },
  { id: 't07', name: 'Ergonomia no trabalho',              norm: 'NR-17', hours: '4h',  validity: '2 anos', roles: 'Todos colaboradores', mode: 'EAD',        status: 'green', statusLabel: 'Ativo'         },
  { id: 't08', name: 'Equipamentos de proteção individual',norm: 'NR-06', hours: '4h',  validity: '1 ano',  roles: 'Todos colaboradores', mode: 'EAD',        status: 'green', statusLabel: 'Ativo'         },
];

/* ---------------------------------------------------------------
   TRABALHADORES — cada um com perfil completo e treinamentos
   --------------------------------------------------------------- */
const Workers = [
  {
    id: 'w001',
    name: 'Carlos Alberto Mendes', initials: 'CAM', matricula: '#00412',
    role: 'Eletricista Sênior', sector: 'Infraestrutura',
    manager: 'Paulo Henrique', admission: 'Mar 2019',
    email: 'c.mendes@metalurgica.com.br', phone: '(71) 99801-2233',
    compliance: 67, status: 'amber', statusLabel: 'Em risco',
    trainings: [
      { name: 'Segurança em instalações elétricas', norm: 'NR-10', progress: 100, done: 'Jun 2024', expires: 'Jun 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido'       },
      { name: 'Máquinas e equipamentos',            norm: 'NR-12', progress: 100, done: 'Ago 2023', expires: 'Ago 2024', expiresColor: 'amber', status: 'amber', statusLabel: 'Vencido'      },
      { name: 'Trabalho em altura',                 norm: 'NR-35', progress: 60,  done: '—',        expires: '—',        expiresColor: '',      status: 'blue',  statusLabel: 'Em andamento' },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 0,   done: '—',        expires: '—',        expiresColor: '',      status: 'gray',  statusLabel: 'Pendente'     },
    ],
  },
  {
    id: 'w002',
    name: 'Fernanda Rocha', initials: 'FR', matricula: '#00389',
    role: 'Técnica de Segurança', sector: 'Manutenção',
    manager: 'Lucas Andrade', admission: 'Jan 2020',
    email: 'f.rocha@metalurgica.com.br', phone: '(71) 99700-4455',
    compliance: 100, status: 'green', statusLabel: 'Conforme',
    trainings: [
      { name: 'Segurança em instalações elétricas', norm: 'NR-10', progress: 100, done: 'Abr 2024', expires: 'Abr 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Trabalho em altura',                 norm: 'NR-35', progress: 100, done: 'Mai 2024', expires: 'Mai 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Espaço confinado',                   norm: 'NR-33', progress: 100, done: 'Jan 2025', expires: 'Jan 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 100, done: 'Mar 2025', expires: 'Mar 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
    ],
  },
  {
    id: 'w003',
    name: 'Maria Santos', initials: 'MS', matricula: '#00451',
    role: 'Operadora de Prensa', sector: 'Produção',
    manager: 'Renata Lima', admission: 'Jun 2021',
    email: 'm.santos@metalurgica.com.br', phone: '(71) 98833-6677',
    compliance: 0, status: 'red', statusLabel: 'Não conforme',
    trainings: [
      { name: 'Máquinas e equipamentos',            norm: 'NR-12', progress: 100, done: 'Fev 2023', expires: 'Fev 2024', expiresColor: 'amber', status: 'red',  statusLabel: 'Vencido'  },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 100, done: 'Jan 2023', expires: 'Jan 2024', expiresColor: 'amber', status: 'red',  statusLabel: 'Vencido'  },
      { name: 'Ergonomia no trabalho',              norm: 'NR-17', progress: 0,   done: '—',        expires: '—',        expiresColor: '',      status: 'gray', statusLabel: 'Pendente' },
    ],
  },
  {
    id: 'w004',
    name: 'Roberto Lima', initials: 'RL', matricula: '#00298',
    role: 'Supervisor Logístico', sector: 'Logística',
    manager: 'Paulo Henrique', admission: 'Ago 2017',
    email: 'r.lima@metalurgica.com.br', phone: '(71) 99655-8899',
    compliance: 100, status: 'green', statusLabel: 'Conforme',
    trainings: [
      { name: 'Ergonomia no trabalho',              norm: 'NR-17', progress: 100, done: 'Nov 2024', expires: 'Nov 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 100, done: 'Out 2024', expires: 'Out 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Equipamentos de proteção individual',norm: 'NR-06', progress: 100, done: 'Set 2024', expires: 'Set 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Proteção contra incêndio',           norm: 'NR-23', progress: 100, done: 'Dez 2023', expires: 'Dez 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Máquinas e equipamentos',            norm: 'NR-12', progress: 100, done: 'Jul 2024', expires: 'Jul 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
    ],
  },
  {
    id: 'w005',
    name: 'Antônio Leal', initials: 'AL', matricula: '#00467',
    role: 'Operador de Máquinas', sector: 'Produção',
    manager: 'Renata Lima', admission: 'Fev 2022',
    email: 'a.leal@metalurgica.com.br', phone: '(71) 98744-1122',
    compliance: 67, status: 'amber', statusLabel: 'Em risco',
    trainings: [
      { name: 'Máquinas e equipamentos',            norm: 'NR-12', progress: 100, done: 'Mar 2024', expires: 'Mar 2025', expiresColor: 'amber', status: 'amber', statusLabel: 'Vencendo' },
      { name: 'Ergonomia no trabalho',              norm: 'NR-17', progress: 100, done: 'Abr 2024', expires: 'Abr 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido'   },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 45,  done: '—',        expires: '—',        expiresColor: '',      status: 'blue',  statusLabel: 'Em andamento' },
    ],
  },
  {
    id: 'w006',
    name: 'Juliana Costa', initials: 'JC', matricula: '#00312',
    role: 'Analista de Qualidade', sector: 'Qualidade',
    manager: 'Lucas Andrade', admission: 'Nov 2018',
    email: 'j.costa@metalurgica.com.br', phone: '(71) 99510-3344',
    compliance: 100, status: 'green', statusLabel: 'Conforme',
    trainings: [
      { name: 'Ergonomia no trabalho',              norm: 'NR-17', progress: 100, done: 'Jan 2025', expires: 'Jan 2027', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 100, done: 'Fev 2025', expires: 'Fev 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Equipamentos de proteção individual',norm: 'NR-06', progress: 100, done: 'Mar 2025', expires: 'Mar 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Proteção contra incêndio',           norm: 'NR-23', progress: 100, done: 'Abr 2024', expires: 'Abr 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Máquinas e equipamentos',            norm: 'NR-12', progress: 100, done: 'Mai 2024', expires: 'Mai 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
    ],
  },
  {
    id: 'w007',
    name: 'Marcos Pereira', initials: 'MP', matricula: '#00501',
    role: 'Eletricista Pleno', sector: 'Infraestrutura',
    manager: 'Paulo Henrique', admission: 'Mai 2023',
    email: 'm.pereira@metalurgica.com.br', phone: '(71) 98622-5566',
    compliance: 50, status: 'amber', statusLabel: 'Em risco',
    trainings: [
      { name: 'Segurança em instalações elétricas', norm: 'NR-10', progress: 100, done: 'Jun 2023', expires: 'Jun 2025', expiresColor: 'amber', status: 'amber', statusLabel: 'Vencendo' },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 100, done: 'Jul 2023', expires: 'Jul 2024', expiresColor: 'amber', status: 'red',   statusLabel: 'Vencido'  },
      { name: 'Trabalho em altura',                 norm: 'NR-35', progress: 0,   done: '—',        expires: '—',        expiresColor: '',      status: 'gray',  statusLabel: 'Pendente' },
      { name: 'Ergonomia no trabalho',              norm: 'NR-17', progress: 100, done: 'Ago 2023', expires: 'Ago 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido'   },
    ],
  },
  {
    id: 'w008',
    name: 'Cláudia Ferreira', initials: 'CF', matricula: '#00433',
    role: 'Técnica de Produção', sector: 'Produção',
    manager: 'Renata Lima', admission: 'Set 2020',
    email: 'c.ferreira@metalurgica.com.br', phone: '(71) 99388-7788',
    compliance: 33, status: 'red', statusLabel: 'Não conforme',
    trainings: [
      { name: 'Máquinas e equipamentos',            norm: 'NR-12', progress: 100, done: 'Out 2022', expires: 'Out 2023', expiresColor: 'amber', status: 'red',  statusLabel: 'Vencido'  },
      { name: 'Ergonomia no trabalho',              norm: 'NR-17', progress: 100, done: 'Nov 2023', expires: 'Nov 2025', expiresColor: 'green', status: 'green',statusLabel: 'Válido'   },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 20,  done: '—',        expires: '—',        expiresColor: '',      status: 'blue', statusLabel: 'Em andamento' },
    ],
  },
  {
    id: 'w009',
    name: 'Diego Nascimento', initials: 'DN', matricula: '#00388',
    role: 'Mecânico de Manutenção', sector: 'Manutenção',
    manager: 'Lucas Andrade', admission: 'Mar 2016',
    email: 'd.nascimento@metalurgica.com.br', phone: '(71) 99211-9900',
    compliance: 100, status: 'green', statusLabel: 'Conforme',
    trainings: [
      { name: 'Trabalho em altura',                 norm: 'NR-35', progress: 100, done: 'Jan 2025', expires: 'Jan 2027', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Espaço confinado',                   norm: 'NR-33', progress: 100, done: 'Fev 2025', expires: 'Fev 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 100, done: 'Mar 2024', expires: 'Mar 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Ergonomia no trabalho',              norm: 'NR-17', progress: 100, done: 'Abr 2024', expires: 'Abr 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
    ],
  },
  {
    id: 'w010',
    name: 'Patricia Souza', initials: 'PS', matricula: '#00419',
    role: 'Coordenadora Administrativa', sector: 'Administrativo',
    manager: 'Paulo Henrique', admission: 'Jul 2015',
    email: 'p.souza@metalurgica.com.br', phone: '(71) 99044-1010',
    compliance: 100, status: 'green', statusLabel: 'Conforme',
    trainings: [
      { name: 'Ergonomia no trabalho',              norm: 'NR-17', progress: 100, done: 'Mai 2024', expires: 'Mai 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 100, done: 'Jun 2024', expires: 'Jun 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Proteção contra incêndio',           norm: 'NR-23', progress: 100, done: 'Jul 2023', expires: 'Jul 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
    ],
  },
  {
    id: 'w011',
    name: 'Eduardo Alves', initials: 'EA', matricula: '#00476',
    role: 'Operador de Caldeira', sector: 'Produção',
    manager: 'Renata Lima', admission: 'Dez 2021',
    email: 'e.alves@metalurgica.com.br', phone: '(71) 98977-1122',
    compliance: 67, status: 'amber', statusLabel: 'Em risco',
    trainings: [
      { name: 'Máquinas e equipamentos',            norm: 'NR-12', progress: 100, done: 'Jan 2024', expires: 'Jan 2025', expiresColor: 'amber', status: 'amber', statusLabel: 'Vencendo' },
      { name: 'Espaço confinado',                   norm: 'NR-33', progress: 100, done: 'Fev 2024', expires: 'Fev 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido'   },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 0,   done: '—',        expires: '—',        expiresColor: '',      status: 'gray',  statusLabel: 'Pendente' },
    ],
  },
  {
    id: 'w012',
    name: 'Bruna Oliveira', initials: 'BO', matricula: '#00344',
    role: 'Analista de Qualidade', sector: 'Qualidade',
    manager: 'Lucas Andrade', admission: 'Abr 2019',
    email: 'b.oliveira@metalurgica.com.br', phone: '(71) 99155-3344',
    compliance: 100, status: 'green', statusLabel: 'Conforme',
    trainings: [
      { name: 'Ergonomia no trabalho',              norm: 'NR-17', progress: 100, done: 'Set 2024', expires: 'Set 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Primeiros socorros e emergências',   norm: 'NR-07', progress: 100, done: 'Out 2024', expires: 'Out 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Equipamentos de proteção individual',norm: 'NR-06', progress: 100, done: 'Nov 2024', expires: 'Nov 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Proteção contra incêndio',           norm: 'NR-23', progress: 100, done: 'Dez 2023', expires: 'Dez 2025', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
      { name: 'Máquinas e equipamentos',            norm: 'NR-12', progress: 100, done: 'Jan 2025', expires: 'Jan 2026', expiresColor: 'green', status: 'green', statusLabel: 'Válido' },
    ],
  },
];

/* Helpers de lookup */
function getWorkerById(id) {
  return Workers.find(w => w.id === id) || Workers[0];
}

/* ---------------------------------------------------------------
   OUTROS DADOS DO SISTEMA
   --------------------------------------------------------------- */
const Data = {
  metrics: { compliance: 84, workers: 312, expiring: 38, nonCompliant: 24 },

  alerts: [
    { norm: 'NR-12', title: 'Operadores de prensa (Linha B)', count: 14, days: 12, level: 'urgent'  },
    { norm: 'NR-35', title: 'Trabalho em altura (Manutenção)', count: 8, days: 19, level: 'urgent'  },
    { norm: 'NR-10', title: 'Eletricistas (Infraestrutura)',  count: 16, days: 28, level: 'monitor' },
  ],

  recentActivity: [
    { name: 'Carlos Mendes',  training: 'Segurança elétrica básica', norm: 'NR-10', date: '05 Jun 2025', status: 'green', statusLabel: 'Concluído'    },
    { name: 'Fernanda Rocha', training: 'Trabalho em altura',        norm: 'NR-35', date: '04 Jun 2025', status: 'green', statusLabel: 'Concluído'    },
    { name: 'Antônio Leal',   training: 'Máquinas e equipamentos',   norm: 'NR-12', date: '03 Jun 2025', status: 'amber', statusLabel: 'Em andamento' },
    { name: 'Maria Santos',   training: 'Primeiros socorros',        norm: 'NR-07', date: '02 Jun 2025', status: 'red',   statusLabel: 'Vencido'      },
    { name: 'Roberto Lima',   training: 'Segurança elétrica básica', norm: 'NR-10', date: '01 Jun 2025', status: 'green', statusLabel: 'Concluído'    },
  ],

  departments: [
    { name: 'Infraestrutura', pct: 91  },
    { name: 'Produção',       pct: 78  },
    { name: 'Logística',      pct: 85  },
    { name: 'Manutenção',     pct: 67  },
    { name: 'Qualidade',      pct: 96  },
    { name: 'Administrativo', pct: 100 },
  ],

  normCompliance: [
    { norm: 'NR-10', pct: 88, valid: 44,  expired: 6  },
    { norm: 'NR-12', pct: 72, valid: 86,  expired: 33 },
    { norm: 'NR-35', pct: 83, valid: 58,  expired: 12 },
    { norm: 'NR-07', pct: 95, valid: 209, expired: 11 },
    { norm: 'NR-33', pct: 80, valid: 24,  expired: 6  },
  ],

  reportWorkers: Workers.map(w => ({
    name: w.name, sector: w.sector, role: w.role,
    valid:   w.trainings.filter(t => t.status === 'green').length,
    expired: w.trainings.filter(t => t.status === 'red' || t.status === 'amber').length,
    pct: w.compliance, status: w.status, statusLabel: w.statusLabel,
  })),

  portalTrainings: {
    pending: [
      { name: 'Trabalho em altura',      norm: 'NR-35', progress: 60,  deadline: 'Prazo: 30 Jun 2025', deadlineColor: 'amber', status: 'blue', statusLabel: 'Em andamento', action: 'Continuar' },
      { name: 'Primeiros socorros',      norm: 'NR-07', progress: 0,   deadline: 'Prazo: 15 Jul 2025', deadlineColor: '',      status: 'gray', statusLabel: 'Não iniciado', action: 'Iniciar'   },
      { name: 'Máquinas e equipamentos', norm: 'NR-12', progress: 100, deadline: 'Venceu em Ago 2024', deadlineColor: 'red',   status: 'red',  statusLabel: 'Vencido',      action: 'Refazer'   },
    ],
    completed: [
      { name: 'Segurança em instalações elétricas', norm: 'NR-10', done: '15 Jun 2024', validUntil: '15 Jun 2026', status: 'green', statusLabel: 'Válido' },
    ],
  },
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
   SIDEBAR
   --------------------------------------------------------------- */
function renderSidebar(activePage, workerMode = false) {
  const name     = State.currentName;
  const initials = State.currentInitials;
  const role     = State.currentRole;

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
        <div class="logo-text"><span class="logo-g">g</span><span class="logo-etrin">etrin</span></div>
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
      <div class="sidebar-section-label">Config.</div>
      <a href="/html/empresa.html" class="nav-item ${activePage==='empresa'?'active':''}"><i class="ti ti-building-factory-2"></i>Empresa</a>
    </div>` : ''}
    <div class="sidebar-footer">
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
   MODALS + TOAST (injetados no body)
   --------------------------------------------------------------- */
function openModal(id)  { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }
function submitModal(id, msg) { closeModal(id); showToast(msg); }

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
  document.body.insertAdjacentHTML('beforeend', `
    <div class="toast" id="toast">
      <i class="ti ti-check"></i>
      <span id="toast-msg">Ação realizada com sucesso.</span>
    </div>

    <div class="modal-overlay" id="modal-training">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">Novo treinamento</span>
          <i class="ti ti-x modal-close" onclick="closeModal('modal-training')"></i>
        </div>
        <div class="modal-body">
          <div class="form-field">
            <label class="form-label">Nome do treinamento</label>
            <input class="form-input" id="training-name" placeholder="Ex: Segurança em instalações elétricas" />
          </div>
          <div class="form-grid-2">
            <div class="form-field">
              <label class="form-label">Norma regulamentadora</label>
              <select class="form-select" id="training-norm"><option>NR-10</option><option>NR-12</option><option>NR-35</option><option>NR-07</option><option>NR-23</option><option>NR-33</option></select>
            </div>
            <div class="form-field">
              <label class="form-label">Carga horária</label>
              <input class="form-input" id="training-hours" placeholder="Ex: 40h" />
            </div>
          </div>
          <div class="form-grid-2">
            <div class="form-field">
              <label class="form-label">Validade</label>
              <select class="form-select" id="training-validity"><option>6 meses</option><option>1 ano</option><option>2 anos</option></select>
            </div>
            <div class="form-field">
              <label class="form-label">Modalidade</label>
              <select class="form-select" id="training-mode"><option>Presencial</option><option>EAD</option><option>Híbrido</option></select>
            </div>
          </div>
          <div class="form-field">
            <label class="form-label">Funções designadas</label>
            <input class="form-input" id="training-roles" placeholder="Ex: Eletricista, Manutenção" />
          </div>
          <div class="form-field">
            <label class="form-label">E-mail do funcionário</label>
            <input class="form-input" id="training-worker-email" type="email" placeholder="funcionario@empresa.com" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="closeModal('modal-training')">Cancelar</button>
          <button class="btn btn-primary" onclick="submitTrainingModal()">Criar treinamento</button>
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
}

async function submitTrainingModal() {
  const name = document.getElementById('training-name')?.value.trim() || '';
  const norm = document.getElementById('training-norm')?.value || '';
  const hours = document.getElementById('training-hours')?.value.trim() || '';
  const validity = document.getElementById('training-validity')?.value || '';
  const mode = document.getElementById('training-mode')?.value || '';
  const roles = document.getElementById('training-roles')?.value.trim() || '';
  const worker_email = document.getElementById('training-worker-email')?.value.trim() || '';

  if (!name || !norm || !hours || !validity || !mode) {
    showToast('Preencha os campos obrigatórios do treinamento.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/trainings`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, norm, hours, validity, roles, mode, worker_email })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao criar treinamento.');
    }

    closeModal('modal-training');
    showToast(worker_email ? 'Treinamento criado e atribuído com sucesso.' : 'Treinamento criado com sucesso.');
  } catch (error) {
    showToast(error.message || 'Erro ao criar treinamento.');
  }
}

async function submitAssignModal() {
  const trainingId = document.getElementById('assign-training-id')?.value || '';
  const worker_email = document.getElementById('assign-worker-email')?.value.trim() || '';
  const deadline = document.getElementById('assign-deadline')?.value || '';
  const notes = document.getElementById('assign-notes')?.value.trim() || '';

  if (!trainingId || !worker_email) {
    showToast('Informe o treinamento e o e-mail do funcionário.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/worker-trainings`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        worker_email,
        training_id: trainingId,
        expires: deadline || '—',
        done: notes || '—',
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

document.addEventListener('DOMContentLoaded', async () => {
  injectSharedHTML();
  await populateAssignTrainingSelect();
});