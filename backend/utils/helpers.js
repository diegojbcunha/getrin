'use strict';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/**
 * Parseia "Jun 2026" → Date (dia 1 do mês).
 * Retorna null se o formato for inválido ou a string for "—".
 */
function parseExpiryDate(str) {
  if (!str || str === '—') return null;
  const parts = String(str).trim().split(' ');
  if (parts.length !== 2) return null;
  const m = MESES.indexOf(parts[0]);
  if (m < 0) return null;
  const year = parseInt(parts[1]);
  if (isNaN(year)) return null;
  return new Date(year, m, 1);
}

/**
 * Calcula data de vencimento a partir de:
 *   doneStr:     "Jun 2024" ou ISO "2024-06-01"
 *   validityStr: "2 anos" | "1 ano" | "6 meses"
 * Retorna string "Mmm YYYY" ou "—" se inválido.
 */
function calcExpiryDate(doneStr, validityStr) {
  try {
    let base;
    const parts = String(doneStr).trim().split(' ');
    if (parts.length === 2 && MESES.includes(parts[0])) {
      base = new Date(parseInt(parts[1]), MESES.indexOf(parts[0]), 1);
    } else {
      base = new Date(doneStr);
    }
    if (isNaN(base.getTime())) return '—';

    const match = String(validityStr).match(/(\d+)\s*(ano|mes|mês)/i);
    if (!match) return '—';

    const qty  = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('ano')) base.setFullYear(base.getFullYear() + qty);
    else                        base.setMonth(base.getMonth() + qty);

    return `${MESES[base.getMonth()]} ${base.getFullYear()}`;
  } catch (_) {
    return '—';
  }
}

/**
 * Retorna a cor de alerta com base nos dias restantes até o vencimento.
 *   > 60 dias  → 'green'
 *   30–60 dias → 'amber'
 *   < 30 dias ou passado → 'red'
 *   Inválido → ''
 */
function calcExpiryColor(expiresStr) {
  const exp = parseExpiryDate(expiresStr);
  if (!exp) return '';
  const diffDays = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
  if (diffDays > 60) return 'green';
  if (diffDays > 30) return 'amber';
  return 'red';
}

function makeInitials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2)
    .map(n => n[0].toUpperCase()).join('');
}

function formatNameFromEmail(email) {
  if (!email) return 'Usuário';
  return email.split('@')[0].split(/[._-]/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

module.exports = {
  MESES,
  parseExpiryDate,
  calcExpiryDate,
  calcExpiryColor,
  makeInitials,
  formatNameFromEmail
};
