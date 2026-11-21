# Caderno

Aplicativo de notas e atividades feito com React, TypeScript e Vite. Funciona no navegador em
computadores e celulares e pode ser instalado como PWA. O app é local-first: notas, atividades e
preferências comuns ficam no aparelho; o Supabase é usado somente quando um conteúdo é compartilhado
por convite ou quando um aparelho ativa as notificações push.

**Aplicativo publicado:** [sirrenanwht.github.io/fecha-aba-ai](https://sirrenanwht.github.io/fecha-aba-ai/)

## Recursos

### Notas

- Editor rich text com negrito, itálico, sublinhado, tachado, títulos, listas, citações e links.
- Checkboxes clicáveis. Os itens podem ser aninhados; ao concluir todos os filhos, o checkbox pai é
  concluído automaticamente. A indentação pode ser ajustada arrastando os itens.
- Fontes por nota: Inter, Lora, Caveat e Mono.
- Personalização visual: cores de destaque, cor personalizada e temas automático, claro, escuro e
  papel.
- Imagens de capa escolhidas da galeria ou pela câmera. O app redimensiona e comprime as imagens em
  WebP e permite ajustar enquadramento, posição e zoom no card.
- Busca por título, conteúdo e tags; filtros por tags; notas fixadas e arquivadas; salvamento
  automático.

### Compartilhamento e colaboração

- **Link de cópia:** carrega uma cópia da nota no próprio link, sem armazená-la no servidor. O
  destinatário pode visualizar uma prévia e importar uma versão editável.
- **Arquivo `.caderno.json`:** alternativa para notas com imagens ou links grandes.
- **Convite colaborativo:** várias pessoas podem editar o título e o conteúdo da mesma nota em tempo
  real. As alterações de texto são mescladas pelo Yjs.
- **Atividades compartilhadas:** convite permite editar título, descrição, status, progresso,
  subtarefas, prazo, prioridade e projeto em tempo real.
- **Backup completo:** exporta notas, capas, atividades e preferências. A restauração permite
  mesclar cópias ou substituir os dados locais.
- Também é possível importar uma nota individual de um arquivo `.caderno.json`.

### Atividades

- Status: a fazer, em andamento, pausada e concluída.
- Progresso automático pelas subtarefas ou manual de 0 a 100%; conclusão das subtarefas atualiza o
  progresso e o status da atividade.
- Prazo, prioridade e projeto; atividades podem ser vistas em lista ou kanban.
- Recorrência mensal opcional. Ao concluir uma ocorrência, a próxima atividade é criada
  automaticamente no mesmo dia do mês; em meses curtos, o prazo usa o último dia disponível e datas
  que já passaram são puladas. Em atividades compartilhadas, o Supabase cria a próxima ocorrência
  uma única vez e a disponibiliza para todos os participantes.
- Notificações locais opcionais um dia antes e no dia do vencimento, verificadas quando o app está
  aberto.
- Atividades compartilhadas podem enviar lembretes de prazo e notas/atividades compartilhadas
  enviam avisos de alteração por push. Cada aparelho precisa ativar as notificações em **Ajustes**.

### PWA e atualizações

- Instalável pelo navegador em desktop, Android e iPhone.
- Service worker mantém os recursos do app em cache para abrir offline após a primeira visita. Os
  dados locais continuam disponíveis sem conexão.
- O app verifica se existe uma versão mais nova e exibe **Atualizar agora**.
- Publicações na branch `main` iniciam o workflow do GitHub Pages; também é possível iniciar o
  workflow manualmente no GitHub Actions.

## Executar localmente

Requisitos: Node.js e pnpm.

```powershell
pnpm install
pnpm dev
```

Para gerar e servir a versão de produção localmente:

```powershell
pnpm build
pnpm serve
```

No Windows, `iniciar.cmd` também prepara o build quando necessário, inicia o servidor local e abre
`http://127.0.0.1:4173`.

## Comandos

| Comando | Descrição |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento com hot reload |
| `pnpm build` | Typecheck e build de produção em `dist/` |
| `pnpm serve` | Serve o build local com fallback de SPA |
| `pnpm check` | Executa somente o typecheck |
| `pnpm generate:vapid` | Gera chaves VAPID para notificações push |
| `pnpm generate:cron-secret` | Gera a chave que protege a chamada agendada da Edge Function |
| `pnpm e2e` | Verificação de fumaça da Fase 2 via Chrome DevTools Protocol |
| `pnpm e2e:f3` | Verifica compartilhamento, importação e backup |
| `pnpm e2e:theme` | Verifica tema da nota nos cards e no editor |
| `pnpm e2e:f4` | Verifica atividades, kanban, exportação e backup |
| `pnpm e2e:f5` | Verifica manifest, service worker, cache e modo offline |

Os scripts e2e precisam do app servido e de um Chrome compatível com Chrome DevTools Protocol.

## Como os dados são armazenados

- Notas, atividades e preferências ficam no `localStorage`, com chaves versionadas `ndb:v2:*`.
- Imagens de capa ficam no IndexedDB (`ndb-images`); o `localStorage` guarda o identificador e os
  ajustes de enquadramento.
- O conteúdo rich text é editado com Tiptap/ProseMirror, sanitizado com DOMPurify e validado junto
  aos modelos de dados com Zod.
- O app migra os dados antigos `ndb:v1:*` de texto para HTML na primeira abertura.
- Link comum e backup são gerados no aparelho. Ao criar um convite colaborativo, o conteúdo
  compartilhado é enviado ao Supabase para sincronização.
- As tabelas do Supabase usam RLS para que somente participantes do convite acessem aquele conteúdo.
- A colaboração transmite atualizações incrementais com Yjs por canais privados do Supabase
  Realtime e mantém atualizações/snapshots no banco para sincronizar quem entra depois ou reconecta.
- A sessão Supabase é anônima e fica no aparelho. Não há cadastro por e-mail, senha ou recuperação
  de conta. Cada navegador/aparelho tem sua própria identidade anônima.
- As inscrições push guardam endpoint e chaves técnicas do navegador no Supabase, associadas à
  identidade anônima daquele aparelho.

Um convite colaborativo funciona como uma chave de acesso: qualquer pessoa que tenha o link pode
entrar. Compartilhe-o apenas com quem deve editar.

## Configuração do Supabase

O projeto usa o Supabase `rcmssdqsbbxpjgumblfb`. Para configurar outro ambiente ou reconstruir o
backend, abra **SQL Editor** no painel Supabase e execute os scripts nesta ordem:

1. `supabase/collaboration.sql` — documentos compartilhados, participantes, convites, atualizações
   Yjs, funções de criação/entrada e políticas RLS/Realtime.
2. `supabase/shared-activities.sql` — estado compartilhado das atividades e função de convite.
3. `supabase/shared-activity-recurrence.sql` — salvamento coordenado e geração única da próxima
   ocorrência compartilhada.
4. `supabase/push-subscriptions.sql` — inscrições push por aparelho e políticas para cada usuário.
5. `supabase/shared-activity-push.sql` — deduplicação dos lembretes de prazo.
6. `supabase/shared-update-push.sql` — deduplicação dos avisos de alterações compartilhadas.

Para a colaboração sem cadastro, habilite **Anonymous Sign-Ins** no Supabase Auth e configure o
hCaptcha no Supabase Auth. O app usa a Sitekey pública para mostrar o desafio; o secret do hCaptcha
fica no painel do Supabase. O domínio publicado precisa estar permitido na allowlist do hCaptcha:
`sirrenanwht.github.io`. Para desenvolvimento local, use um hostname local personalizado apontado
para `127.0.0.1` e permita esse hostname no hCaptcha; `localhost` e `127.0.0.1` não são hosts
aceitos pelo hCaptcha deste projeto.

## Notificações push

Os lembretes de prazo usam `send-deadline-push`, Web Push/VAPID e um job Supabase Cron executado a
cada 15 minutos. Os avisos de alteração usam `send-shared-update-push`: depois de salvar no Supabase,
o app chama a função autenticada, que avisa os outros participantes e limita cada aparelho a um
aviso por sala a cada cinco minutos. Ao abrir ou voltar ao app, o cliente busca o estado mais recente.
As duas funções removem inscrições que o provedor de push já invalidou.

Os lembretes de prazo em segundo plano cobrem **atividades compartilhadas**. Para atividades locais
não compartilhadas, os lembretes funcionam enquanto o app está aberto.

### Segredos e publicação

- `VITE_VAPID_PUBLIC_KEY` é uma **Repository variable** do GitHub. O workflow passa essa variável
  ao build do Pages.
- `VAPID_PRIVATE_KEY_JSON` é um **Edge Function Secret** do Supabase. A chave privada não deve ser
  enviada ao navegador nem salva no repositório.
- `DEADLINE_PUSH_CRON_SECRET` é um **Edge Function Secret** do Supabase e também é salvo no Vault
  pelo SQL de agendamento. Os dois valores precisam coincidir.

Para criar as chaves em uma configuração nova:

1. Execute `node scripts/generate-vapid.mjs`. Cadastre a chave pública como `VITE_VAPID_PUBLIC_KEY`
   nas variáveis do repositório GitHub e o JSON privado como `VAPID_PRIVATE_KEY_JSON` nos segredos
   das Edge Functions do Supabase.
2. Execute `node scripts/generate-cron-secret.mjs` e cadastre o resultado como
   `DEADLINE_PUSH_CRON_SECRET` nos segredos das Edge Functions. Não compartilhe nem versione esse
   valor.
3. Faça login na CLI e publique a função. No Windows, a execução por `npx` não exige instalação
   global:

   ```powershell
   npx supabase login
   npx supabase functions deploy send-deadline-push --remote=rcmssdqsbbxpjgumblfb --use-api
   ```

   Se a CLI não puder gravar em `C:\Users\<usuário>\.supabase`, defina o diretório local abaixo
   antes dos comandos. A pasta está no `.gitignore`:

   ```powershell
   $env:SUPABASE_HOME = Join-Path (Get-Location) ".supabase-home"
   ```

4. Publique também a função de avisos de alteração:

   ```powershell
   npx supabase functions deploy send-shared-update-push --remote=rcmssdqsbbxpjgumblfb --use-api
   ```

5. No arquivo `supabase/schedule-deadline-push.sql`, substitua
   `PREENCHA_COM_A_MESMA_CHAVE` pela chave do passo 2 e execute o arquivo **uma única vez** no SQL
   Editor. Ele ativa `pg_cron`, `pg_net`, Vault e agenda a função.
6. Depois de cadastrar a variável pública no GitHub, publique o site novamente. Em cada aparelho,
   permita notificações no navegador e ative **Ajustes → Notificações**. Se o lembrete local
   já estava ativado antes de configurar o push, desative e ative novamente para cadastrar a
   inscrição do aparelho.

## Publicação do site

O arquivo `.github/workflows/deploy.yml` executa o typecheck, gera o build com base
`/fecha-aba-ai/` e publica `dist/` no GitHub Pages quando há push em `main` ou `master`. O workflow
também pode ser iniciado manualmente pela aba **Actions** do repositório.

## Estrutura do projeto

```text
src/
  app/                         layout e aviso de atualização
  components/                  botões, ícones, diálogos, hCaptcha e toast
  features/notes/              lista, cards, editor e colaboração de notas
  features/activities/         lista, kanban, editor, colaboração e lembretes
  features/sharing/            links, importação e backup
  features/settings/           aparência, instalação, notificações e dados
  hooks/                       stores, capas, instalação e título do documento
  lib/model/                   schemas e regras de notas/atividades
  lib/storage/                 localStorage, IndexedDB, migração e stores
  lib/share/                   formatos, links, arquivos e backup
  lib/collaboration/           Supabase Auth, convites, Yjs e push
  pwa/sw-template.js           service worker e recebimento de push
  styles/global.css            estilos e design system
supabase/
  collaboration.sql            colaboração de notas
  shared-activities.sql         colaboração de atividades
  shared-activity-recurrence.sql geração coordenada de recorrências compartilhadas
  push-subscriptions.sql        inscrição push por aparelho
  shared-activity-push.sql      deduplicação dos lembretes de prazo
  shared-update-push.sql        deduplicação de avisos de alteração
  schedule-deadline-push.sql    extensões Vault/Cron e agendamento
  functions/send-deadline-push/ envio dos lembretes de prazo
  functions/send-shared-update-push/ avisos de alteração compartilhada
scripts/                        servidor, geradores de chaves e verificações e2e
public/                         manifest, ícones e arquivos estáticos
```

## Limitações atuais

- Não há sincronização geral das notas e atividades locais entre aparelhos. A sincronização entre
  dispositivos existe para itens que foram explicitamente compartilhados por convite.
- Em notas colaborativas, título e conteúdo são editados em tempo real. Fonte, cores, tema e ajustes
  da capa são transferidos na criação do convite e exibidos, mas ainda não podem ser editados e
  sincronizados pelo editor colaborativo.
- As preferências e a permissão de notificações são por aparelho; cada dispositivo precisa ativá-las
  individualmente.
