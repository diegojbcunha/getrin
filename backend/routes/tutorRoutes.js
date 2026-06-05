'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');

/**
 * Proxy para o Google Gemini API
 * Mantém a API_KEY segura no servidor.
 */
router.post('/chat', requireAuth, async (req, res) => {
  const { message, history } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'SUA_CHAVE_AQUI') {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor.' });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: history,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Erro na comunicação com o Gemini');
    }

    res.json(data);
  } catch (err) {
    console.error('Erro no Tutor Proxy:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
