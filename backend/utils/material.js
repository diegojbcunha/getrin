'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'materials');
const MAX_PDF_BYTES = 12 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Gera/valida o id do material.
 * IMPORTANTE: worker_trainings.viewed_materials é uuid[] no Postgres,
 * então todo material precisa ter um id em formato UUID real.
 * Se o item já vier com um uuid válido (ex: edição de um material existente),
 * reaproveita — isso preserva o histórico de "viewed_materials" dos workers
 * que já marcaram aquele material como visto.
 */
function resolveMaterialId(rawId) {
  const candidate = String(rawId || '').trim();
  if (UUID_RE.test(candidate)) return candidate.toLowerCase();
  return crypto.randomUUID();
}

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function savePdfMaterial(material) {
  const raw = material.pdf_data || material.fileData || '';
  if (!raw) return material.url || '';

  const match = String(raw).match(/^data:application\/pdf;base64,(.+)$/);
  const base64 = match ? match[1] : String(raw);
  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) throw new Error('PDF vazio ou invalido.');
  if (buffer.length > MAX_PDF_BYTES) throw new Error('PDF maior que 12 MB.');
  if (buffer.slice(0, 4).toString() !== '%PDF') throw new Error('O arquivo enviado precisa ser um PDF.');

  ensureUploadDir();
  // Usa o id (já resolvido para uuid) como nome de arquivo — estável e único.
  const filename = `${safeId(material.id) || crypto.randomUUID()}.pdf`;
  fs.writeFileSync(path.join(UPLOAD_ROOT, filename), buffer);
  return `/uploads/materials/${filename}`;
}

function normalizeMaterials(input = []) {
  const source = Array.isArray(input) ? input : [];

  return source
    .map((item, index) => {
      const type = item.type === 'pdf' ? 'pdf' : 'youtube';
      const id = resolveMaterialId(item.id);
      const title = String(item.title || '').trim() || `Material ${index + 1}`;
      let url = String(item.url || '').trim();

      if (type === 'pdf') {
        url = savePdfMaterial({ ...item, id });
      }

      if (!url) return null;

      return {
        id,
        type,
        title,
        url,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function parseMaterials(value) {
  if (Array.isArray(value)) return normalizeMaterials(value);
  if (!value) return [];
  try {
    return normalizeMaterials(JSON.parse(value));
  } catch (_) {
    return [];
  }
}

function parseViewedMaterials(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_) {
    return [];
  }
}

function calculateMaterialProgress(materials = [], viewedMaterials = []) {
  const total = materials.length;
  if (total === 0) return 0;

  const viewed = new Set(parseViewedMaterials(viewedMaterials));
  const done = materials.filter(m => viewed.has(String(m.id))).length;
  return Math.round((done / total) * 100);
}

module.exports = {
  normalizeMaterials,
  parseMaterials,
  parseViewedMaterials,
  calculateMaterialProgress,
};