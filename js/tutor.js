/* =============================================================
   GETRIN — Tutor de Segurança IA
   js/tutor.js

   COMO CONFIGURAR:
   1. Acesse https://aistudio.google.com/app/apikey
   2. Crie uma chave gratuita
   3. Cole em GEMINI_API_KEY abaixo (ou defina via variável de
      ambiente se preferir não deixar no código)

   MODELO USADO: gemini-1.5-flash (grátis, rápido)
   ============================================================= */

const GEMINI_API_KEY = 'SUA_CHAVE_AQUI'; // ← substituir pela chave real
const GEMINI_MODEL   = 'gemini-1.5-flash-latest';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/* ──────────────────────────────────────────────────────────────
   PROMPT DE SISTEMA
   Define a personalidade e o contexto do tutor.
   Personalize este texto com as regras específicas da sua empresa.
   ────────────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `
Você é o Tutor de Segurança do sistema Getrin, um assistente especializado em
segurança do trabalho e normas regulamentadoras brasileiras (NRs).

Seu papel é ajudar colaboradores industriais — especialmente os mais novos —
a tirar dúvidas sobre procedimentos de segurança, EPIs obrigatórios e normas.

REGRAS DE COMPORTAMENTO:
- Responda sempre em português brasileiro, de forma clara e acolhedora.
- Seja direto: responda em no máximo 3 parágrafos curtos.
- Nunca invente regras. Se não souber, diga "Consulte o responsável de segurança."
- Use listas com marcadores quando listar EPIs ou passos de procedimento.
- Não forneça informações sobre outros assuntos — foque em segurança do trabalho.

CONTEXTO DA EMPRESA (Metalúrgica — Sistema Getrin):
- Setores: Infraestrutura, Produção, Logística, Manutenção, Qualidade, Administrativo
- Normas em uso: NR-06 (EPIs), NR-07 (PCMSO), NR-10 (Elétrica), NR-12 (Máquinas),
  NR-17 (Ergonomia), NR-23 (Incêndio), NR-33 (Espaço Confinado), NR-35 (Altura)
- EPIs disponíveis no almoxarifado: capacete, luva de vaqueta, luva isolante,
  óculos de proteção, protetor auricular, botina com biqueira, cinto de segurança,
  máscara PFF2, avental de raspa

EXEMPLOS DE PERGUNTAS VÁLIDAS:
- "Qual EPI devo usar para operar a prensa?"
- "O que fazer em caso de acidente elétrico?"
- "Qual a validade do treinamento NR-35?"
- "Como solicitar um EPI novo?"
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
  'O que é NR-35?',
  'Como reportar um acidente?',
  'Validade do treinamento NR-12?',
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

      <!-- Aviso de chave não configurada -->
      <div class="tutor-api-warning ${GEMINI_API_KEY !== 'SUA_CHAVE_AQUI' ? 'hidden' : ''}" id="tutor-api-warning">
        <i class="ti ti-alert-triangle" style="flex-shrink:0;margin-top:1px;"></i>
        <span>
          Configure sua chave do Gemini em <strong>js/tutor.js</strong> para ativar as respostas da IA.
          <a href="https://aistudio.google.com/app/apikey" target="_blank"
             style="color:var(--amber-800);font-weight:500;">Obter chave gratuita →</a>
        </span>
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
    `Olá${State.currentName ? ', ' + State.currentName.split(' ')[0] : ''}! 👷 Sou o Tutor de Segurança do Getrin.\n\nPode me perguntar sobre EPIs, normas regulamentadoras (NRs), procedimentos de segurança ou o que precisar para trabalhar com segurança.`
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
  if (dot)   dot.classList.remove('show'); // limpa notificação ao abrir
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

  // Limpa input e esconde sugestões após primeira interação
  if (input) input.value = '';
  const sugEl = document.getElementById('tutor-suggestions');
  if (sugEl) sugEl.style.display = 'none';

  // Exibe a mensagem do usuário
  tutorAddMessage('user', text);

  // Impede nova mensagem enquanto processa
  _tutorBusy = true;
  const sendBtn = document.getElementById('tutor-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  // Mostra o indicador de digitação
  const typingEl = tutorShowTyping();

  try {
    const reply = await tutorCallGemini(text);
    tutorRemoveTyping(typingEl);
    tutorAddMessage('ai', reply);

    // Notifica no FAB se o painel estiver fechado (não acontece aqui, mas
    // útil se o usuário fechar antes da resposta chegar)
    if (!_tutorOpen) {
      const dot = document.getElementById('tutor-fab-dot');
      if (dot) dot.classList.add('show');
    }
  } catch (err) {
    tutorRemoveTyping(typingEl);
    tutorAddMessage('ai', `Não consegui obter uma resposta no momento. ${err.message || 'Verifique sua chave de API e conexão.'}`);
  } finally {
    _tutorBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input)   input.focus();
  }
}

/* ──────────────────────────────────────────────────────────────
   CHAMADA À API DO GEMINI
   ────────────────────────────────────────────────────────────── */
async function tutorCallGemini(userText) {
  if (GEMINI_API_KEY === 'SUA_CHAVE_AQUI') {
    // Modo demo: resposta simulada para testar sem chave
    await new Promise(r => setTimeout(r, 900));
    return tutorDemoResponse(userText);
  }

  // Adiciona a mensagem do usuário ao histórico de conversa
  _tutorHistory.push({ role: 'user', parts: [{ text: userText }] });

  const body = {
    // Instrução de sistema passada como primeira mensagem 'user' + 'model'
    // (Gemini Flash aceita system_instruction no campo dedicado)
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: _tutorHistory,
    generationConfig: {
      temperature:     0.4,  // menos criativo, mais preciso para segurança
      maxOutputTokens: 512,
      topP:            0.85,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const res = await fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Erro HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!reply) throw new Error('Resposta vazia da IA.');

  // Armazena a resposta no histórico para manter contexto da conversa
  _tutorHistory.push({ role: 'model', parts: [{ text: reply }] });

  // Limita o histórico a 20 turnos para não estourar o limite de tokens
  if (_tutorHistory.length > 40) _tutorHistory = _tutorHistory.slice(-40);

  return reply;
}

/* ──────────────────────────────────────────────────────────────
   RESPOSTAS DEMO (sem chave de API configurada)
   Permite testar a interface durante o desenvolvimento.
   ────────────────────────────────────────────────────────────── */
function tutorDemoResponse(text) {
  const t = text.toLowerCase();

  if (t.includes('epi') || t.includes('equipamento') || t.includes('proteção')) {
    return `Para uso geral na linha de produção, os EPIs obrigatórios são:\n\n• Capacete de segurança (NR-06)\n• Óculos de proteção\n• Protetor auricular (em áreas com ruído > 85 dB)\n• Botina com biqueira de aço\n• Luva de vaqueta para manuseio de materiais\n\nPara atividades específicas (elétrica, altura, espaço confinado), consulte o responsável de segurança para os EPIs adicionais.`;
  }
  if (t.includes('nr-10') || t.includes('elétric') || t.includes('eletric')) {
    return `A **NR-10** trata da segurança em instalações e serviços em eletricidade.\n\nPrincipais pontos:\n• Treinamento obrigatório a cada **2 anos**\n• Carga horária mínima: 40 horas\n• EPIs obrigatórios: luva isolante, óculos, capacete com jugular e botina dielétrica\n• Antes de qualquer intervenção elétrica, garantir o bloqueio e etiquetagem (LOTO)\n\nSempre verifique se o equipamento está **desenergizado** antes de iniciar qualquer trabalho.`;
  }
  if (t.includes('nr-35') || t.includes('altura')) {
    return `A **NR-35** regulamenta o trabalho em altura (acima de 2 metros).\n\nRequisitos principais:\n• Treinamento obrigatório a cada **2 anos** (8 horas)\n• Uso obrigatório de cinto de segurança tipo paraquedista + talabarte com absorvedor de impacto\n• Inspeção do ponto de ancoragem antes de iniciar\n• Proibido trabalhar em altura com vento forte, chuva ou superfícies escorregadias\n\nEm caso de dúvida, pare e consulte o supervisor imediatamente.`;
  }
  if (t.includes('acidente') || t.includes('emergência') || t.includes('emergencia')) {
    return `Em caso de acidente ou emergência:\n\n1. **Garanta sua segurança** primeiro — não se exponha ao mesmo risco\n2. Chame socorro imediatamente (ramal interno: 190 ou supervisor direto)\n3. Não mova o acidentado, exceto se houver risco de vida\n4. Preste primeiros socorros básicos se estiver treinado\n5. Preserve o local para investigação\n\nTodo acidente, mesmo sem lesão, deve ser **comunicado ao RH e ao SESMT** no mesmo dia.`;
  }
  if (t.includes('nr-12') || t.includes('máquina') || t.includes('maquina') || t.includes('prensa')) {
    return `A **NR-12** trata de segurança no trabalho em máquinas e equipamentos.\n\nPara operar a prensa ou qualquer máquina:\n• Verifique se os dispositivos de proteção estão instalados e funcionando\n• Nunca remova proteções ou trave sensores de segurança\n• EPIs: óculos, luva de vaqueta, protetor auricular e botina\n• Validade do treinamento: **1 ano**\n\nQualquer anomalia na máquina deve ser reportada ao líder antes de operar.`;
  }

  // Resposta padrão
  return `Entendi sua dúvida! Para garantir a resposta mais precisa, recomendo:\n\n• Consultar o manual de segurança da sua área\n• Falar com o técnico de segurança do setor\n• Verificar os procedimentos operacionais padrão (POPs) afixados na área\n\n⚠️ **Modo demonstração ativo** — configure a chave do Gemini em \`js/tutor.js\` para obter respostas completas da IA.`;
}

/* ──────────────────────────────────────────────────────────────
   HELPERS DE RENDERIZAÇÃO
   ────────────────────────────────────────────────────────────── */

/* Adiciona uma bolha de mensagem na conversa */
function tutorAddMessage(role, text) {
  const container = document.getElementById('tutor-messages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = `tutor-msg ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'tutor-bubble';
  // Formata markdown simples: **negrito**, listas com •, quebras de linha
  bubble.innerHTML = tutorFormatText(text);

  div.appendChild(bubble);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/* Exibe o indicador de "digitando..." */
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

/* Remove o indicador de digitação */
function tutorRemoveTyping(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

/* Formata texto com markdown simples para HTML seguro */
function tutorFormatText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') // escape HTML
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')                   // **negrito**
    .replace(/`(.+?)`/g, '<code style="font-family:var(--mono);font-size:11px;background:rgba(0,0,0,.07);padding:1px 4px;border-radius:3px;">$1</code>') // `código`
    .replace(/\n/g, '<br>');                                             // quebras de linha
}

/* ──────────────────────────────────────────────────────────────
   INICIALIZAÇÃO — chamada pelo data.js após DOMContentLoaded
   ────────────────────────────────────────────────────────────── */
function initTutor() {
  // Não exibe o tutor na página de login
  if (window.location.pathname.includes('login')) return;
  injectTutor();
}