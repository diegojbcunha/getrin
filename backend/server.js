/* =============================================================
   GETRIN — Backend API
   backend/server.js
   ============================================================= */

'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

// Rotas
const authRoutes      = require('./routes/authRoutes');
const workerRoutes    = require('./routes/workerRoutes');
const trainingRoutes       = require('./routes/trainingRoutes');
const workerTrainingRoutes = require('./routes/workerTrainingRoutes');
const dashboardRoutes      = require('./routes/dashboardRoutes');
const reportRoutes         = require('./routes/reportRoutes');
const alertRoutes          = require('./routes/alertRoutes');
const settingsRoutes       = require('./routes/settingsRoutes');
const tutorRoutes          = require('./routes/tutorRoutes');

const app  = express();
const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, '..');

// ── Middlewares ────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));

// Arquivos estáticos do frontend
app.use('/css',  express.static(path.join(PROJECT_ROOT, 'css')));
app.use('/js',   express.static(path.join(PROJECT_ROOT, 'js')));
app.use('/html', express.static(path.join(PROJECT_ROOT, 'html')));
app.use(express.static(PROJECT_ROOT));

// Redirecionamentos básicos
app.get('/',      (_req, res) => res.redirect('/html/login.html'));
app.get('/login', (_req, res) => res.redirect('/html/login.html'));

// ── Rotas da API ───────────────────────────────────────────────
app.use('/api/auth',             authRoutes);
app.use('/api/workers',          workerRoutes);
app.use('/api/worker-trainings', workerTrainingRoutes);
app.use('/api/trainings',        trainingRoutes);
app.use('/api/dashboard',        dashboardRoutes);
app.use('/api/reports',          reportRoutes);
app.use('/api/alerts',           alertRoutes);
app.use('/api/settings',         settingsRoutes);
app.use('/api/tutor',            tutorRoutes);

// ── Inicialização do Servidor ──────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`✓ Getrin rodando em http://localhost:${PORT}`);
  
  // Verificação básica de variáveis críticas
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('sua-url')) {
    console.warn('⚠️ AVISO: SUPABASE_URL não configurada corretamente.');
  }
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'SUA_CHAVE_AQUI') {
    console.warn('⚠️ AVISO: GEMINI_API_KEY não configurada. O Tutor IA não funcionará.');
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✗ Porta ${PORT} já está em uso.`);
    process.exit(0);
  } else {
    console.error('Erro ao iniciar servidor:', err);
    process.exit(1);
  }
});
