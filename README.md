# Getrin — Sistema de Gestão de Treinamentos Industriais

Sistema web de gestão e monitoramento de treinamentos corporativos voltado para pequenas e médias indústrias brasileiras. Desenvolvido como Trabalho de Conclusão de Curso (TCC).

---

## O Problema

Pequenas e médias indústrias são obrigadas por lei a manter seus colaboradores treinados e certificados em Normas Regulamentadoras do trabalho — como NR-10, NR-12 e NR-35. O descumprimento gera multas que começam em **R$ 2.529 por infração**, podendo dobrar em caso de reincidência, além do risco de interdição das atividades.

A solução atual da maioria dessas empresas é uma planilha manual — sem alertas automáticos, sem rastreabilidade para auditoria e sem acesso do colaborador.

---

## A Solução

O Getrin funciona como um **Google Classroom corporativo para indústrias**:

- A empresa cadastra seus próprios treinamentos **ou** acessa uma biblioteca de NRs prontas
- Os gestores monitoram a conformidade de cada colaborador em tempo real
- Os colaboradores acessam e realizam os treinamentos diretamente pela plataforma
- O sistema gera alertas automáticos de vencimento e relatórios para auditoria

---

## Funcionalidades

### Para o Gestor / Administrador
- Dashboard com indicadores de conformidade por setor
- Cadastro de colaboradores por cargo e setor
- Cadastro de treinamentos próprios (vídeo, PDF, texto)
- Biblioteca de treinamentos prontos organizados por NR
- Atribuição de treinamentos por cargo ou individualmente
- Alertas automáticos de vencimento (30 e 7 dias)
- Relatórios exportáveis para auditoria do Ministério do Trabalho

### Para o Colaborador
- Portal pessoal com treinamentos pendentes e concluídos
- Acesso e execução dos treinamentos na plataforma
- Certificado automático ao concluir
- Visualização do próprio status de conformidade

---

## Perfis de Usuário

| Perfil | Acesso |
|---|---|
| **Administrador** | Acesso total — gerencia empresa, usuários e treinamentos |
| **Gestor** | Monitora a equipe e atribui treinamentos |
| **Colaborador** | Acessa e realiza os próprios treinamentos |

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | HTML, CSS e JavaScript puro |
| Banco de dados | PostgreSQL via Supabase |
| Autenticação | Supabase Auth |
| Segurança | Row Level Security (RLS) |
| Hospedagem | Supabase (banco) + GitHub Pages / Vercel (frontend) |

---

## Estrutura do Projeto

```
getrin/
├── index.html              # Redireciona para login
├── html/
│   ├── login.html          # Tela de autenticação
│   ├── dashboard.html      # Painel do gestor
│   ├── workers.html        # Gestão de colaboradores
│   ├── trainings.html      # Catálogo de treinamentos
│   ├── reports.html        # Relatórios e exportação
│   └── portal.html         # Portal do colaborador
├── css/
│   └── style.css           # Estilos globais
├── js/
│   ├── supabase.js         # Configuração do cliente Supabase
│   ├── auth-guard.js       # Proteção de rotas por perfil
│   ├── utils.js            # Funções utilitárias reutilizáveis
│   └── ...                 # Scripts por tela
├── backend/
│   └── ...                 # Funções e lógica de servidor
└── schema_supabase.txt     # Estrutura do banco de dados
```

---

## Banco de Dados

### Tabelas principais

| Tabela | Descrição |
|---|---|
| `companies` | Empresas cadastradas no sistema |
| `users_profile` | Perfil de usuário vinculado à empresa |
| `workers` | Colaboradores com cargo, setor e matrícula |
| `trainings` | Catálogo de treinamentos (`company_id NULL` = biblioteca global de NRs) |
| `worker_trainings` | Vínculo colaborador x treinamento com progresso e data de conclusão |
| `alerts` | Alertas de vencimento por empresa |
| `audit_logs` | Log de todas as ações críticas do sistema |

### View automática

A view `worker_trainings_status` calcula automaticamente:
- `expires_at` — data de vencimento com base em `done_at + validity_months`
- `status` — green / amber / red / blue / gray, sem necessidade de atualização manual

### Segurança

- **RLS ativo** em todas as tabelas — dados de uma empresa são completamente invisíveis para outra
- Isolamento por empresa via `users_profile.company_id`
- Treinamentos da biblioteca global (`company_id IS NULL`) são visíveis para todas as empresas

---

## Como Rodar Localmente

### Pré-requisitos
- Conta no [Supabase](https://supabase.com) (gratuito)
- Navegador moderno (Chrome, Firefox, Edge ou Safari)

### Passo a passo

**1. Clone o repositório**
```bash
git clone https://github.com/diegojbcunha/getrin.git
cd getrin
```

**2. Configure o Supabase**

Crie um projeto no Supabase e execute o conteúdo de `schema_supabase.txt` no SQL Editor para criar todas as tabelas, views e políticas de segurança.

**3. Configure as credenciais**

No arquivo `js/supabase.js`, substitua com as credenciais do seu projeto:
```javascript
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'sua_anon_key_aqui';
```

**4. Abra o projeto**

Abra o `index.html` diretamente no navegador ou use uma extensão como Live Server no VS Code.

---

## Alinhamento com ODS da ONU

| ODS | Relação |
|---|---|
| **ODS 4** — Educação de Qualidade | Garante capacitação contínua e rastreável no ambiente industrial |
| **ODS 8** — Trabalho Decente e Crescimento Econômico | Promove ambientes de trabalho seguros e conformes com a legislação |

---

## Contexto Acadêmico

Projeto desenvolvido como TCC do curso de **Análise e Desenvolvimento de Sistemas**.

**Problema central:** Lacuna entre o que a legislação trabalhista exige (NRs) e o que as PMEs industriais conseguem controlar com as ferramentas que têm acesso (planilhas).

**Proposta de valor:** Sistema acessível que substitui planilhas manuais, entregando controle de conformidade, alertas automáticos e evidências para auditoria — sem exigir equipe de TI ou departamento de RH estruturado.

---

## Licença

Este projeto foi desenvolvido para fins acadêmicos.
