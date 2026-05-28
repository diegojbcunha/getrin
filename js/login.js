/* =============================================================
   GETRIN — Login
   js/login.js
   ============================================================= */

/* Seleciona o perfil de acesso (clique nos cards de role) */
function setLoginRole(role) {
  State.loginRole = role;

  document.querySelectorAll('.role-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.role === role);
  });
}

/* Submete o login e redireciona conforme o perfil selecionado */
function doLogin() {
  const role = State.loginRole;

  if (role === 'worker') {
    State.currentName     = 'Carlos Alberto Mendes';
    State.currentInitials = 'CAM';
    State.currentRole     = 'Trabalhador';
    State.selectedWorker  = 'b0000000-0000-0000-0000-000000000001';
    window.location.href  = 'portal.html';
  } else if (role === 'manager') {
    State.currentName     = 'Paulo Henrique';
    State.currentInitials = 'PH';
    State.currentRole     = 'Gestor';
    window.location.href  = 'profile.html';
  } else {
    State.currentName     = 'Paulo Henrique';
    State.currentInitials = 'PH';
    State.currentRole     = 'Administrador';
    window.location.href  = 'dashboard.html';
  }
}

/* Init */
document.addEventListener('DOMContentLoaded', () => {
  /* Marca o role salvo como ativo (caso o usuário volte ao login) */
  const saved = State.loginRole;
  document.querySelectorAll('.role-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.role === saved);
  });

  /* Enter no campo de senha dispara o login */
  const pwInput = document.getElementById('password');
  if (pwInput) pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});
