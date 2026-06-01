/* =============================================================
   GETRIN — Login
   js/login.js
   
   GUIA DE ACESSO E PERFIS (LOGINS PARA TESTE):
   Para testar, crie as contas clicando em "Criar nova conta".
   O perfil é definido automaticamente com base no e-mail:
   
   1. ADMIN: O e-mail deve conter a palavra "admin".
      -> Ex: admin@getrin.com.br
   
   2. GESTOR: O e-mail deve conter a palavra "gestor" ou "manager".
      -> Ex: gestor@getrin.com.br
   
   3. TRABALHADOR: Qualquer outro e-mail. Para visualizar dados reais
      no Portal, use e-mails que já existem no banco de dados.
      -> Ex: f.rocha@metalurgica.com.br (Trabalhadora 100% conforme)
      -> Ex: c.mendes@metalurgica.com.br (Trabalhador em risco)
   ============================================================= */

/* Seleciona o perfil de acesso (clique nos cards de role) */
function setLoginRole(role) {
  State.loginRole = role;
  document.querySelectorAll('.role-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.role === role);
  });
}

/* Exibe mensagem de erro no formulário */
function showLoginError(msg) {
  let el = document.getElementById('login-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'login-error';
    el.style.cssText = `
      background: var(--red-100, #fee2e2);
      color: var(--red-700, #b91c1c);
      border: 1px solid var(--red-300, #fca5a5);
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 12.5px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    const btn = document.querySelector('.login-btn');
    btn.parentNode.insertBefore(el, btn);
  }
  el.innerHTML = `<i class="ti ti-alert-circle"></i><span>${msg}</span>`;
  el.style.display = 'flex';
}

function hideLoginError() {
  const el = document.getElementById('login-error');
  if (el) el.style.display = 'none';
}

/* Redireciona conforme o papel do usuário */
function redirectByRole(role) {
  if (role === 'worker') {
    window.location.href = '/html/portal.html';
  } else if (role === 'manager') {
    window.location.href = '/html/dashboard.html';
  } else {
    window.location.href = '/html/dashboard.html';
  }
}

/* Submete o login — chama a API real */
async function doLogin() {
  hideLoginError();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const role     = State.loginRole;

  if (!email || !password) {
    showLoginError('Preencha o e-mail e a senha para continuar.');
    return;
  }

  const btn = document.querySelector('.login-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Aguarde…';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showLoginError(data.error || 'Erro ao fazer login. Tente novamente.');
      return;
    }

    /* Persiste sessão */
    State.token           = data.token;
    State.currentName     = data.user.name;
    State.currentInitials = data.user.initials;

    /* Usa o papel selecionado pelo usuário na interface (ou o detectado pela API) */
    const finalRole = role || data.user.role;
    State.loginRole   = finalRole;
    State.currentRole = finalRole === 'admin'   ? 'Administrador'
                      : finalRole === 'manager' ? 'Gestor'
                      : 'Trabalhador';

    redirectByRole(finalRole);

  } catch (err) {
    console.error('Erro de rede no login:', err);
    showLoginError('Não foi possível conectar ao servidor. Verifique se o backend está rodando.');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/* Init */
document.addEventListener('DOMContentLoaded', () => {
  /* Se já está logado, vai direto para a área correta */
  if (State.token) {
    redirectByRole(State.loginRole);
    return;
  }

  /* Marca o role salvo como ativo */
  const saved = State.loginRole;
  document.querySelectorAll('.role-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.role === saved);
  });

  /* Enter no campo de senha dispara o login */
  const pwInput = document.getElementById('password');
  if (pwInput) {
    pwInput.value = ''; // limpa o valor estático do HTML
    pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }

  /* Limpa e-mail pré-preenchido do HTML */
  const emailInput = document.getElementById('email');
  if (emailInput) emailInput.value = '';
});

/* Modais de Cadastro */
function openSignupModal() {
  document.getElementById('modal-signup').style.display = 'flex';
  document.getElementById('signup-error').style.display = 'none';
  document.getElementById('signup-success').style.display = 'none';
  document.getElementById('signup-email').value = '';
  document.getElementById('signup-password').value = '';
}

function closeSignupModal() {
  document.getElementById('modal-signup').style.display = 'none';
}

async function submitSignup() {
  const errEl = document.getElementById('signup-error');
  const succEl = document.getElementById('signup-success');
  errEl.style.display = 'none';
  succEl.style.display = 'none';

  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const role = document.getElementById('signup-role').value;

  if (!email || !password) {
    errEl.textContent = "Por favor, preencha o e-mail e a senha.";
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('btn-submit-signup');
  const oldText = btn.innerHTML;
  btn.innerHTML = `<i class="ti ti-loader-2" style="animation: spin 1s linear infinite;"></i> Criando...`;
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erro ao criar conta.");
    }

    // Sucesso!
    succEl.textContent = "Conta criada com sucesso! Você já pode entrar no sistema.";
    succEl.style.display = 'block';
    
    // Auto preenche o login principal
    document.getElementById('email').value = email;
    document.getElementById('password').value = password;
    setLoginRole(role);

    setTimeout(() => {
      closeSignupModal();
    }, 2500);

  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
}
