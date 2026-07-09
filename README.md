# Getrin — Gestão de Treinamentos Industriais

Sistema web de gestão e monitoramento de treinamentos corporativos voltado para pequenas e médias indústrias brasileiras, com foco em conformidade com Normas Regulamentadoras (NRs).

Desenvolvido como Trabalho de Conclusão de Curso — SENAI CIMATEC, 2026.

🔗 **[Acessar o sistema](https://getrin.vercel.app/html/login.html)**

---

## O Problema

47% das empresas brasileiras ainda controlam treinamentos obrigatórios em planilhas manuais — sem alertas de vencimento, sem rastreabilidade e sem como comprovar conformidade numa fiscalização (Valor Econômico, 2026).

Como resume a advogada trabalhista Silvia Fidalgo Lira: **"treinamento não comprovado equivale a treinamento não realizado"** (RH Pra Você, 2026).

---

## A Solução

O Getrin centraliza em um único lugar o que hoje está espalhado em planilhas e papéis: cadastro de treinamentos, validade por norma, status de cada colaborador e relatório pronto para comprovação.

**Modelo híbrido:**
- A empresa sobe seus próprios conteúdos (manuais, vídeos, procedimentos internos)
- Ou acessa uma biblioteca de treinamentos prontos por NR (NR-10, NR-12, NR-35...)
- Ou os dois ao mesmo tempo

---

## Funcionalidades

**Para o Gestor**
- Dashboard com indicadores de conformidade em tempo real
- Atribuição de treinamentos por cargo e função
- Alertas automáticos de vencimento (30 e 7 dias antes)
- Relatório de conformidade exportável para auditoria

**Para o Colaborador**
- Portal pessoal com treinamentos pendentes e concluídos
- Acesso e execução dos treinamentos pela plataforma
- Certificado digital emitido automaticamente ao concluir
- Acesso offline com sincronização automática

---

## Perfis de Usuário

| Perfil | Acesso |
|---|---|
| Administrador | Acesso total — gerencia empresa, usuários e treinamentos |
| Gestor | Monitora a equipe e atribui treinamentos |
| Colaborador | Acessa e realiza os próprios treinamentos |

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | HTML, CSS e JavaScript |
| Banco de dados | PostgreSQL via Supabase |
| Autenticação | Supabase Auth |
| Segurança | Row Level Security (RLS) |
| Hospedagem | Render |

---

## Estrutura do Projeto

```
getrin/
├── index.html
├── html/
│   ├── login.html
│   ├── dashboard.html
│   ├── workers.html
│   ├── trainings.html
│   ├── reports.html
│   └── portal.html
├── css/
│   └── style.css
├── js/
│   ├── supabase.js
│   ├── auth-guard.js
│   ├── utils.js
│   └── ...
├── backend/
│   └── server.js
└── schema_supabase.txt
```

---

## Banco de Dados

| Tabela | Descrição |
|---|---|
| `companies` | Empresas cadastradas |
| `users_profile` | Perfil de usuário vinculado à empresa |
| `workers` | Colaboradores com cargo, setor e matrícula |
| `trainings` | Catálogo de treinamentos (`company_id NULL` = biblioteca global de NRs) |
| `worker_trainings` | Vínculo colaborador x treinamento com progresso e data de conclusão |
| `alerts` | Alertas de vencimento por empresa |
| `audit_logs` | Log de todas as ações críticas |

A view `worker_trainings_status` calcula automaticamente `expires_at` e status (green/amber/red/blue/gray) com base em `done_at + validity_months`.

RLS ativo em todas as tabelas — dados de uma empresa são completamente isolados de outra.

---

## Como Rodar Localmente

**Pré-requisitos:** conta no [Supabase](https://supabase.com) (gratuito) e navegador moderno.

```bash
# 1. Clone o repositório
git clone https://github.com/diegojbcunha/getrin.git
cd getrin

# 2. Configure o Supabase
# Execute o conteúdo de schema_supabase.txt no SQL Editor do Supabase

# 3. Configure as credenciais em js/supabase.js
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co'
const SUPABASE_ANON_KEY = 'sua_anon_key'

# 4. Abra o index.html no navegador ou use Live Server
```

---

## Acesso de Demonstração

```
URL: (https://getrin.vercel.app/html/login.html)
Usuário: admin@getrin.com
Senha: 123456
```

---

## Equipe

| Nome | Papel |
|---|---|
| Diego José Barbosa da Cunha (GP) | Coordenação geral e arquitetura técnica |
| Amanda Dantas Laudelino | Desenvolvimento frontend e requisitos |
| Jhonata Enzo Silva Gomes | Desenvolvimento backend e banco de dados |
| Jonathas Barbosa da Anunciação | Desenvolvimento backend e integração Supabase |
| Matheus Ryan Alves Santos | Desenvolvimento backend e testes |

**Orientador:** Celso Barreto da Silva
**Coordenador:** Daniele Souza das Virgens

---

## Referências

- INTEGRAÇÃO; ABTD; CARVALHO & MELLO. Panorama do Treinamento no Brasil 2025/2026.
- MINISTÉRIO DO TRABALHO E EMPREGO. Portaria MTE nº 1.419/2024 — Atualização da NR-1.
- RH PRA VOCÊ. Falhas em treinamentos e gestão de riscos. Abr. 2026.
- VALOR ECONÔMICO / PRESSWORKS. O custo oculto das planilhas de treinamento. Mar. 2026.
- SEBRAE. É recorde: 5,1 milhões de empresas foram abertas em 2025. Jan. 2026.

---

## Licença

Projeto acadêmico desenvolvido como TCC — SENAI CIMATEC, curso de Desenvolvimento de Sistemas, turma 93645.
