---
name: senha-padrao-primeiro-acesso
description: >
  Use esta skill sempre que precisar implementar criação de usuário para uma empresa no ConstrutorRH
  ou em qualquer sistema SaaS multiempresa onde: (1) a senha padrão do novo usuário deve ser os
  primeiros 6 dígitos do CNPJ da empresa; (2) o sistema deve forçar a troca de senha no primeiro
  acesso com uma tela dedicada. Acione esta skill ao criar telas de login de empresa, cadastro de
  usuário master, portal de acesso de empresa, ou qualquer fluxo de autenticação que envolva
  senha inicial + primeiro acesso obrigatório. Também use quando o usuário perguntar sobre
  "senha padrão", "primeiro acesso", "trocar senha no primeiro login", ou "como criar usuário master".
metadata:
  display_name: Regra de Senha Padrão e Primeiro Acesso
compatibility: Claude Code
---

# Regra de Senha Padrão e Primeiro Acesso

## Visão Geral

Esta skill define as regras de negócio e o fluxo de implementação para criação de usuários em
sistemas SaaS multiempresa onde a senha inicial é derivada do CNPJ da empresa, e o primeiro
acesso obriga a troca de senha. Ela captura o padrão implementado no ConstrutorRH e generaliza
para qualquer sistema similar.

---

## Passo 1 — Carregar a skill de website (BLOQUEANTE — faça isso primeiro)

Antes de qualquer implementação de código, chame:

```
load_skill(skill_name="website")
```

Isso é obrigatório e independente de todo o restante. As telas de login e troca de senha são
páginas web e precisam das ferramentas corretas de geração. Somente após o retorno de
`load_skill(skill_name="website")` prossiga para o Passo 2.

---

## Passo 2 — Regras de negócio obrigatórias

### 2.1 Senha padrão = primeiros 6 dígitos do CNPJ

Ao criar um novo usuário para uma empresa:

- Extraia apenas os dígitos do CNPJ: `cnpj.replace(/\D/g, '')`
- Use os **6 primeiros dígitos** como senha padrão: `cnpjDigits.substring(0, 6)`
- Se o CNPJ tiver menos de 5 dígitos (raro), use `'12345'` como fallback
- Armazene **sempre como hash SHA-256**, nunca em texto puro
- Mostre a senha padrão em um toast/notificação para o administrador logo após criar o usuário

```typescript
// Padrão de implementação (TypeScript / React)
async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const cnpjDigits = (empresa.cnpj ?? '').replace(/\D/g, '')
const senhaDefault = cnpjDigits.substring(0, 6) || '123456'
const senhaHash = await sha256(senhaDefault)
```

**Por quê os 6 primeiros dígitos?** É simples o suficiente para o administrador comunicar ao
usuário verbalmente ou por escrito, porém único por empresa — evita senhas genéricas como `123456`.

### 2.2 Flag `primeiro_acesso`

- Ao criar o usuário, grave `primeiro_acesso: true` no banco
- Após a troca bem-sucedida de senha, grave `primeiro_acesso: false`
- A sessão do usuário deve carregar esse flag e verificá-lo imediatamente após o login

### 2.3 Schema mínimo da tabela de usuários

A tabela de usuários deve conter pelo menos:

| Coluna            | Tipo      | Descrição                                      |
|-------------------|-----------|------------------------------------------------|
| `id`              | UUID      | PK                                             |
| `empresa_id`      | UUID      | FK para a tabela de empresas                   |
| `nome`            | TEXT      | Nome completo                                  |
| `email`           | TEXT      | Login único                                    |
| `role`            | TEXT      | Perfil: `master_empresa`, `admin`, `viewer`…  |
| `ativo`           | BOOLEAN   | Controle de acesso                             |
| `senha_hash`      | TEXT      | SHA-256 da senha                               |
| `primeiro_acesso` | BOOLEAN   | `true` até o usuário trocar a senha            |

SQL de migração:
```sql
ALTER TABLE empresa_usuarios
  ADD COLUMN IF NOT EXISTS senha_hash      TEXT,
  ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN DEFAULT true;
```

---

## Passo 3 — Tela de login da empresa

Implemente uma tela de login **separada** da autenticação principal (Supabase Auth ou similar).
Esta tela autentica contra a tabela `empresa_usuarios` diretamente, usando email + senha_hash.

**Campos obrigatórios:** e-mail e senha  
**Fluxo:**
1. Usuário informa e-mail e senha
2. Front-end calcula `sha256(senha)` e compara com `senha_hash` na tabela
3. Se `primeiro_acesso === true` → redirecionar para a tela de troca de senha (Passo 4)
4. Caso contrário → criar sessão (localStorage com TTL de 8 horas) e redirecionar para o dashboard

**Sessão em localStorage:**
```typescript
const SESSION_KEY = 'empresa_usuario_session'
localStorage.setItem(SESSION_KEY, JSON.stringify({ ...userData, ts: Date.now() }))
// TTL: 8 horas = 8 * 60 * 60 * 1000 ms
```

---

## Passo 4 — Tela de troca de senha obrigatória (primeiro acesso)

Esta tela é exibida **automaticamente** após o primeiro login. O usuário não consegue avançar
sem concluir a troca.

**Requisitos mínimos da nova senha:**
- Mínimo 8 caracteres
- Pelo menos 1 letra
- Pelo menos 1 número

**Mostre indicadores visuais em tempo real** (verde/vermelho) para cada requisito enquanto
o usuário digita — isso reduz erros e abandonos.

**Fluxo:**
1. Verificar se há sessão válida com `primeiro_acesso === true`; caso contrário redirecionar para login
2. Usuário digita nova senha + confirmação
3. Validar requisitos no front-end antes de enviar
4. Calcular `sha256(novaSenha)`, gravar no banco com `primeiro_acesso: false`
5. Atualizar a sessão local com `primeiro_acesso: false`
6. Redirecionar para o dashboard

**Banner informativo** na tela: explicar ao usuário que a senha padrão eram os 5 primeiros
dígitos do CNPJ e que agora ele deve criar uma senha pessoal.

---

## Passo 5 — Rotas e guards

Registre as rotas como **públicas** (fora de PrivateRoute/autenticação principal):

```tsx
// App.tsx — dentro do bloco de rotas públicas
<Route path="/empresa-login"        element={<EmpresaLogin />} />
<Route path="/empresa-trocar-senha" element={<EmpresaTrocarSenha />} />
```

A tela de troca de senha deve ter seu próprio guard interno: se não houver sessão válida,
redirecionar para `/empresa-login` em vez de quebrar.

---

## Passo 6 — RLS no Supabase (quando aplicável)

Se o projeto usar Supabase como banco de dados, as políticas RLS nas tabelas `empresas` e
`empresa_usuarios` devem permitir as operações necessárias. Um RLS com subquery recursiva
na própria tabela causa `stack depth limit exceeded` — evite:

```sql
-- ❌ Causa recursão infinita
CREATE POLICY "eu_select" ON empresa_usuarios
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM empresa_usuarios WHERE user_id = auth.uid())
  );

-- ✅ Correto: permissivo para tabelas gerenciadas pelo SaaS admin
CREATE POLICY "eu_all" ON empresa_usuarios
  FOR ALL USING (true) WITH CHECK (true);
```

Se o painel SaaS usar a anon key sem `auth.uid()` (login por PIN ou localStorage),
aplique políticas permissivas nas tabelas de gestão (`empresas`, `empresa_usuarios`)
— a segurança é tratada na camada de aplicação.

---

## Checklist de entrega

- [ ] Passo 1 concluído: `load_skill(skill_name="website")` chamado antes de qualquer código
- [ ] Senha padrão = 6 primeiros dígitos do CNPJ (fallback `'12345'`)
- [ ] Hash SHA-256 armazenado, nunca texto puro
- [ ] Toast mostra a senha padrão ao administrador após criar o usuário
- [ ] Coluna `senha_hash` e `primeiro_acesso` existem na tabela
- [ ] SQL de migração disponível para o banco
- [ ] Tela de login da empresa implementada (email + senha, sessão localStorage 8h)
- [ ] Tela de troca de senha obrigatória com indicadores visuais em tempo real
- [ ] Rotas registradas como públicas no roteador
- [ ] Guard interno na tela de troca de senha
- [ ] RLS do Supabase sem recursão (se aplicável)
