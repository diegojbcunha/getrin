/* =============================================================
   GETRIN — Tutor de Segurança IA
   js/tutor.js

   O Tutor agora utiliza um proxy no backend para maior segurança,
   mantendo a chave da API (GEMINI_API_KEY) protegida no servidor.
   ============================================================= */

/* ──────────────────────────────────────────────────────────────
   PROMPT DE SISTEMA
   Define a personalidade e o contexto do tutor.
   ────────────────────────────────────────────────────────────── */
/* =============================================================
   GETRIN — Tutor de Segurança IA (Versão 100% em Conformidade)
   js/tutor.js
   ============================================================= */

const SYSTEM_PROMPT = `
# PERFIL E IDENTIDADE
Você é o "Tutor", a inteligência artificial integrada ao GETRIN — um Sistema de Gestão de Treinamentos Corporativos de alta tecnologia desenvolvido em parceria com o SENAI CIMATEC. Seu papel atual é atuar como assistente de aprendizagem especializado em Segurança do Trabalho e Normas Regulamentadoras (NRs) brasileiras para uma indústria metalúrgica.

# DIRETRIZES DE ESTILO E FORMATAÇÃO (CRÍTICO)
- Responda sempre em português brasileiro, de forma clara, direta e focada no ambiente de "chão de fábrica".
- Limite estrito: Forneça respostas em no máximo 3 parágrafos curtos.
- REGRA DE LISTAS: O front-end não possui renderizador de markdown tradicional (como "- item"). Sempre que listar passos ou EPIs, use obrigatoriamente caracteres de marcadores visuais (como "• ", "🛡️ ", "⚠️ ") no início da linha, dependendo da quebra de linha natural (\\n).
- Use negrito (**texto**) apenas para destacar siglas de NRs, nomes exatos de EPIs ou termos críticos de segurança.

# INTEGRAÇÃO COM RECURSOS DO SISTEMA GETRIN
Sempre que um colaborador perguntar sobre o andamento de cursos, exames ou burocracias, você deve promover os diferenciais da plataforma:
• Emissão de Certificados: Explique que, ao concluir o treinamento e o quiz no GETRIN, a emissão do certificado é instantânea e automática na plataforma.
• Gamificação: Incentive o usuário lembrando que concluir módulos acumula pontos e desbloqueia badges no "Centro de Conquistas" do GETRIN (como as insígnias de "Dedicado", "Maratonista" ou "Quiz Expert").
• Acesso Offline: Se o usuário mencionar problemas de conexão no galpão ou áreas remotas, informe que o aplicativo GETRIN suporta funcionamento offline parcial e sincronizará o progresso assim que houver rede.

# ESCOPO E SEGURANÇA JURÍDICA
- Limite-se estritamente a assuntos de segurança do trabalho, NRs, EPIs e uso do ecossistema GETRIN. Recuse educadamente qualquer outro tema.
- Nunca invente regras ou prazos personalizados. Se a dúvida envolver uma decisão gerencial, emissão de Permissão de Trabalho (PET) ou se você não tiver certeza absoluta, instrua explicitamente: "Consulte o responsável de segurança ou a equipe do SESMT local."

# CONTEXTO OPERACIONAL DA INDÚSTRIA
- Setores: Infraestrutura, Produção, Logística, Manutenção, Qualidade e Administrativo.
- Normas Aplicadas: NR-06 (EPIs), NR-07 (PCMSO), NR-10 (Elétrica), NR-12 (Máquinas), NR-17 (Ergonomia), NR-23 (Incêndio), NR-33 (Espaço Confinado) e NR-35 (Trabalho em Altura).
- Almoxarifado de EPIs: capacete, luva de vaqueta, luva isolante, óculos de proteção, protetor auricular, botina com biqueira, cinto de segurança, máscara PFF2 e avental de raspa.
`.trim();

   /* ──────────────────────────────────────────────────────────────
   ESTADO DO CHAT
   ────────────────────────────────────────────────────────────── */
let _tutorOpen    = false;
let _tutorHistory = []; // { role: 'user'|'model', parts: [{text}] }
let _tutorBusy    = false;

/* Sugestões mostradas na primeira abertura */
const SUGGESTIONS = [
  'EPI para trabalho elétrico?',
  'Como emito meu certificado?',
  'O app funciona sem internet?',
  'Quais as badges da Gamificação?',
];

/* ──────────────────────────────────────────────────────────────
   INJEÇÃO NO DOM
   ────────────────────────────────────────────────────────────── */
function injectTutor() {
  // Carrega o CSS do tutor dinamicamente
  if (!document.getElementById('tutor-css')) {
    const link = document.createElement('link');
    link.id   = 'tutor-css';
    link.rel  = 'stylesheet';
    link.href = '/css/tutor.css';
    document.head.appendChild(link);
  }

  const html = `
    <!-- Botão flutuante -->
    <button class="tutor-fab" id="tutor-fab" onclick="tutorToggle()" title="Tutor de Segurança IA">
      <i class="ti ti-shield-bolt"></i>
      <span class="tutor-fab-dot" id="tutor-fab-dot"></span>
    </button>

    <!-- Painel do chat -->
    <div class="tutor-panel" id="tutor-panel">

      <!-- Cabeçalho -->
      <div class="tutor-header">
        <div class="tutor-header-avatar">
          <i class="ti ti-shield-bolt"></i>
        </div>
        <div class="tutor-header-info">
          <div class="tutor-header-name">Tutor de Segurança</div>
          <div class="tutor-header-sub">Gemini IA · NRs e EPIs</div>
        </div>
        <i class="ti ti-x tutor-header-close" onclick="tutorToggle()"></i>
      </div>

      <!-- Mensagens -->
      <div class="tutor-messages" id="tutor-messages">
        <!-- Mensagem de boas-vindas injetada pelo JS -->
      </div>

      <!-- Sugestões rápidas -->
      <div class="tutor-suggestions" id="tutor-suggestions">
        ${SUGGESTIONS.map(s =>
          `<button class="tutor-suggestion" onclick="tutorSend('${s}')">${s}</button>`
        ).join('')}
      </div>

      <!-- Rodapé com input -->
      <div class="tutor-footer">
        <input
          class="tutor-input"
          id="tutor-input"
          placeholder="Pergunte sobre segurança, EPIs, NRs…"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();tutorSend();}"
          autocomplete="off"
        />
        <button class="tutor-send" id="tutor-send-btn" onclick="tutorSend()">
          <i class="ti ti-send"></i>
        </button>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  // Injeta a mensagem de boas-vindas
  tutorAddMessage('ai',
    `Olá${typeof State !== 'undefined' && State.currentName ? ', ' + State.currentName.split(' ')[0] : ''}! 👷 Sou o Tutor de Segurança do Getrin.\n\nPode me perguntar sobre EPIs, normas regulamentadoras (NRs), procedimentos de segurança ou o que precisar para trabalhar com segurança.`
  );
}

/* ──────────────────────────────────────────────────────────────
   TOGGLE DO PAINEL
   ────────────────────────────────────────────────────────────── */
function tutorToggle() {
  _tutorOpen = !_tutorOpen;
  const panel = document.getElementById('tutor-panel');
  const dot   = document.getElementById('tutor-fab-dot');
  if (panel) panel.classList.toggle('open', _tutorOpen);
  if (dot)   dot.classList.remove('show'); 
  if (_tutorOpen) {
    setTimeout(() => document.getElementById('tutor-input')?.focus(), 180);
  }
}

/* ──────────────────────────────────────────────────────────────
   ENVIAR MENSAGEM
   ────────────────────────────────────────────────────────────── */
async function tutorSend(textOverride) {
  if (_tutorBusy) return;

  const input   = document.getElementById('tutor-input');
  const text    = (textOverride || input?.value || '').trim();
  if (!text) return;

  if (input) input.value = '';
  const sugEl = document.getElementById('tutor-suggestions');
  if (sugEl) sugEl.style.display = 'none';

  tutorAddMessage('user', text);

  _tutorBusy = true;
  const sendBtn = document.getElementById('tutor-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  const typingEl = tutorShowTyping();

  try {
    const reply = await tutorCallGemini(text);
    tutorRemoveTyping(typingEl);
    tutorAddMessage('ai', reply);

    if (!_tutorOpen) {
      const dot = document.getElementById('tutor-fab-dot');
      if (dot) dot.classList.add('show');
    }
  } catch (err) {
    tutorRemoveTyping(typingEl);
    tutorAddMessage('ai', `Não consegui obter uma resposta no momento. ${err.message || 'Verifique a conexão.'}`);
  } finally {
    _tutorBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input)   input.focus();
  }
}

/* ──────────────────────────────────────────────────────────────
   CHAMADA AO BACKEND (PROXY GEMINI)
   ────────────────────────────────────────────────────────────── */
async function tutorCallGemini(userText) {
  // Inicializa o histórico com o prompt do sistema se estiver vazio
  if (_tutorHistory.length === 0) {
    // No formato do Gemini, podemos passar as instruções de sistema
    // O proxy no backend cuida de formatar corretamente.
  }

  _tutorHistory.push({ role: 'user', parts: [{ text: userText }] });

  // Prepara o payload para o nosso proxy no backend
  const payload = {
    message: userText,
    history: [
      { role: 'user', parts: [{ text: "INSTRUÇÃO DE SISTEMA: " + SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: "Entendido. Serei seu Tutor de Segurança especializado no Getrin." }] },
      ..._tutorHistory
    ]
  };

  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? `http://${location.hostname}:3003/api`
    : '/api';

  const res = await fetch(`${API_BASE}/tutor/chat`, {
    method:  'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionStorage.getItem('getrin_token') || ''}`
    },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro HTTP ${res.status}`);
  }

  const data = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!reply) throw new Error('Resposta vazia da IA.');

  _tutorHistory.push({ role: 'model', parts: [{ text: reply }] });

  if (_tutorHistory.length > 20) _tutorHistory = _tutorHistory.slice(-20);

  return reply;
}

/* ──────────────────────────────────────────────────────────────
   HELPERS DE RENDERIZAÇÃO
   ────────────────────────────────────────────────────────────── */

function tutorAddMessage(role, text) {
  const container = document.getElementById('tutor-messages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = `tutor-msg ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'tutor-bubble';
  bubble.innerHTML = tutorFormatText(text);

  div.appendChild(bubble);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function tutorShowTyping() {
  const container = document.getElementById('tutor-messages');
  if (!container) return null;

  const div = document.createElement('div');
  div.className = 'tutor-typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function tutorRemoveTyping(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function tutorFormatText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code style="font-family:var(--mono);font-size:11px;background:rgba(0,0,0,.07);padding:1px 4px;border-radius:3px;">$1</code>')
    .replace(/\n/g, '<br>');
}

function initTutor() {
  if (window.location.pathname.includes('login')) return;
  injectTutor();
}
