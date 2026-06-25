'use strict';

const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'materials');
const MAX_PDF_BYTES = 12 * 1024 * 1024;

function safeId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function makeMaterialId(prefix = 'mat') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const filename = `${safeId(material.id) || makeMaterialId('pdf')}.pdf`;
  fs.writeFileSync(path.join(UPLOAD_ROOT, filename), buffer);
  return `/uploads/materials/${filename}`;
}

function normalizeMaterials(input = []) {
  const source = Array.isArray(input) ? input : [];

  return source
    .map((item, index) => {
      const type = item.type === 'pdf' ? 'pdf' : 'youtube';
      const id = safeId(item.id) || makeMaterialId(type);
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
