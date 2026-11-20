# Caderno

App de notas e atividades que roda direto no navegador — no PC e no celular — com os
dados salvos no próprio aparelho. A proposta é ser instalável como PWA (sem APK),
offline e sem conta.

**Status: Fase 5 concluída — app completo.** Notas com rich text, fontes, capas,
compartilhamento e backup; atividades com progresso e kanban; colaboração ao vivo em
notas por convite; PWA instalável que funciona offline depois da primeira visita.

**Publicado em:** https://sirrenanwht.github.io/fecha-aba-ai/

## Como abrir agora (Windows)

Dê dois cliques em **`iniciar.cmd`**. Ele gera o build se necessário, sobe um servidor
local e abre `http://127.0.0.1:4173` no navegador.

Se preferir o modo desenvolvimento (recarrega ao editar):

```powershell
pnpm install
pnpm dev
```

> Neste computador o Node.js não está no PATH global. O `iniciar.cmd` já usa o Node
> embutido do ambiente. Para usar `pnpm` no terminal, chame o executável completo:
>
> ```powershell
> & "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" `
>   "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs" dev
> ```

## Scripts

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento com hot reload |
| `pnpm build` | Typecheck + build de produção em `dist/` |
| `pnpm serve` | Serve o `dist/` em `http://127.0.0.1:4173` |
| `pnpm check` | Só o typecheck |
| `pnpm e2e` | Teste de fumaça da F2 via Chrome DevTools Protocol (precisa do app servido) |
| `pnpm e2e:f3` | Teste de compartilhamento, importação e backup (CDP) |
| `pnpm e2e:theme` | Garante que o tema da nota sobrepõe o do app no card e no editor |
| `pnpm e2e:f4` | Teste de atividades, kanban, exportação e backup (CDP) |
| `pnpm e2e:f5` | Teste de manifest, service worker, precache e modo offline (CDP) |

## O que já funciona

### Notas

- **Editor rich text**: negrito, itálico, sublinhado, riscado, títulos H2/H3, listas,
  checkboxes clicáveis com níveis hierárquicos e conclusão automática dos itens pais,
  citação, links e limpar formatação. Todo conteúdo é sanitizado com DOMPurify antes
  de ser salvo.
- **Fontes por nota**: Inter, Lora, Caveat (manuscrita) e Mono — aplicadas no editor e
  no card.
- **Estilo do card**: 6 cores de destaque + cor personalizada e quatro temas
  (automático, claro, escuro, papel). O tema da nota vale para o card **e** para a
  folha do editor — a moldura do app continua com o tema do Caderno.
- **Imagem de capa**: escolher da galeria ou tirar foto; redimensionada para até
  1600 px e comprimida em WebP (~380 KB) no IndexedDB. O enquadramento, a posição e o zoom
  podem ser ajustados na prévia do card; o `localStorage` guarda só o id e esses ajustes.
- **Organização**: busca por título/conteúdo/tags (atalho `/`), filtro por tags
  combináveis, abas Todas / Fixadas / Arquivadas, tags e data relativa.
- **Fluxo**: salvamento automático, excluir com desfazer, fixar e arquivar.
- **Edição colaborativa**: convites permitem que outras pessoas editem título e conteúdo
  da mesma nota em tempo real. As mudanças no texto são mescladas com Yjs; o acesso usa
  identidade anônima do Supabase, sem cadastro.

### Atividades

- **Status**: a fazer, em andamento, pausada e concluída.
- **Progresso**: automático pelas subtarefas ou manual (0–100%). Concluir todas as
  subtarefas conclui a atividade; baixar o progresso manual reabre.
- **Planejamento**: prazo com destaque de atrasadas, prioridade (baixa/média/alta) e
  projeto.
- **Lembretes de prazo**: notificações opcionais um dia antes e no dia do vencimento;
  o app verifica os prazos enquanto está aberto.
- **Visualizações**: lista com resumo geral e filtros, e kanban em quatro colunas com
  troca de etapa pelo seletor do card.
- **Exportar/importar atividades**: arquivo `.json` próprio, com cópias na importação.
- **Backup**: as atividades entram no backup completo ao lado das notas e imagens.
- **Colaboração**: atividades podem ser compartilhadas por convite e editadas em tempo real,
  incluindo status, progresso e subtarefas.

### Compartilhar e backup

- **Link autossuficiente**: o conteúdo da nota (incluindo capa, quando couber) é
  comprimido e vai dentro do próprio link, sem servidor. Quem abre vê uma prévia e
  importa uma cópia editável.
- **Arquivo `.caderno.json`**: alternativa para notas com imagem, já que o link fica
  grande demais para aplicativos de mensagem.
- **Web Share API**: no celular, o botão “Compartilhar…” usa o compartilhamento nativo;
  no desktop ele é escondido e ficam “Copiar link” e “Baixar arquivo”.
- **Convite de colaboração**: cria um link privado de acesso à nota. Qualquer pessoa com
  o link pode entrar; o conteúdo é guardado no Supabase para sincronizar as edições.
- **Backup completo**: exporta todas as notas, imagens de capa e preferências em um
  único JSON. Na restauração, você escolhe **mesclar** (adiciona cópias) ou
  **substituir tudo** (apaga o que existe antes).
- **Importar uma nota avulsa**: o botão “Importar” na lista de notas (e em Ajustes)
  abre a prévia de um `.caderno.json` sem passar pelo backup.

### Configurar colaboração no Supabase

1. No projeto Supabase, abra **SQL Editor → New query**.
2. Se ainda não tiver feito, cole e execute `supabase/collaboration.sql`.
3. Cole e execute `supabase/shared-activities.sql` para habilitar atividades.
4. Acesse uma nota e escolha **Compartilhar** para criar um convite colaborativo, ou abra
   uma atividade e use **Criar convite de colaboração**.
5. Envie o link para a outra pessoa. Ela abre o link no app e entra na mesma nota ou atividade.

As tabelas guardam apenas notas e atividades que receberam um convite. Os scripts habilitam RLS e
restringe a leitura, escrita e canais Realtime aos participantes adicionados pelo convite.
O hCaptcha usa a Sitekey pública configurada no app; no painel do hCaptcha, permita o
hostname `sirrenanwht.github.io` para o site publicado. Para desenvolvimento local, o
hCaptcha não aceita `localhost` nem `127.0.0.1`; use um hostname local personalizado
apontado para `127.0.0.1` e inclua esse hostname na allowlist do sitekey.

### Base

- **Tema**: claro (papel), escuro e sistema — aplicado na hora e lembrado.
- **Persistência**: `localStorage` versionado (`ndb:v2:*`), validado com Zod. As notas
  comuns continuam locais; notas e atividades compartilhadas por convite usam o Supabase.
  As notas da Fase 1 (`ndb:v1:*`, texto puro) são convertidas para HTML na primeira
  abertura e a chave antiga é removida.
- **Responsivo**: sidebar no desktop, navegação inferior + botão flutuante no celular.
- **PWA**: manifest, ícones (incluindo maskable) e service worker com precache
  versionado; instalável pelo navegador e offline depois da primeira visita.

### Instalar e usar offline

- **Android/Chrome**: menu ⋮ → “Instalar app” (ou **Ajustes → Aplicativo → Instalar app**).
- **iPhone/Safari**: Compartilhar → “Adicionar à Tela de Início”.
- **Desktop**: ícone de instalação na barra de endereço ou o botão em Ajustes.
- O service worker guarda todos os arquivos do app; depois da primeira visita ele
  abre sem internet. Os dados continuam vindo do `localStorage`/IndexedDB do aparelho.
- Ao publicar uma versão nova, o service worker troca o cache na visita seguinte.

## Estrutura

```
src/
  app/AppShell.tsx             layout e navegação
  components/                  UI base (botões, ícones, toast, diálogo, vazio)
  features/notes/
    NotesPage.tsx              lista, busca e filtros
    NoteCard.tsx               card com fonte, tema e capa
    NoteEditorPage.tsx         editor + salvamento automático
    RichTextEditor.tsx         contentEditable + toolbar + sanitização
    StylePanel.tsx             fonte, cor, tema e capa
  features/sharing/
    ShareDialog.tsx            link, arquivo e Web Share
    ImportPage.tsx             prévia e importação de nota
    ImportBackupDialog.tsx     mesclar ou substituir backup
  features/activities/
    ActivitiesPage.tsx         resumo, filtros, lista e kanban
    ActivityRow.tsx            linha da lista
    KanbanCard.tsx             card com troca de etapa
    ActivityEditorPage.tsx     subtarefas, progresso, prazo e prioridade
  features/settings/           aparência, dados, backup e zona de risco
  lib/image/compress.ts        resize + WebP
  lib/model/note.ts            schema de nota, fontes e paletas
  lib/model/activity.ts        schema e regras de progresso/status
  lib/share/                   formato, codec do link, export/import e backup
  lib/storage/                 localStorage v2, IndexedDB, migração e seed
  lib/collaboration/           convite, identidade anônima e sincronização Yjs
  supabase/collaboration.sql   tabelas, funções e políticas de acesso
  lib/utils/                   datas, cores, HTML e classes
  pwa/sw-template.js           service worker (precache gerado no build)
  styles/global.css            design system
public/
  manifest.webmanifest         identidade do PWA
  icons/                       ícones 192/512, maskable e Apple
scripts/
  serve.mjs                    servidor estático com fallback de SPA
  generate-icons.py            gera os ícones do PWA
  e2e.mjs                      teste de fumaça da F2 (CDP)
  e2e-f3.mjs                   teste de compartilhamento e backup (CDP)
  e2e-theme.mjs                teste do tema da nota sobre o tema do app
  e2e-f4.mjs                   teste de atividades, kanban e backup
  e2e-f5.mjs                   teste de manifest, SW e modo offline
```

## Dados e privacidade

Notas comuns, atividades e preferências ficam no `localStorage`; imagens de capa ficam
no IndexedDB (`ndb-images`). Ao criar um convite colaborativo, a nota e sua capa são
enviadas ao Supabase para que as pessoas autorizadas pelo link possam trabalhar juntas.
O convite funciona como uma chave de acesso: compartilhe-o apenas com quem deve editar.
**Ajustes → Zona de risco** apaga notas, atividades, imagens e preferências.

## Próximos passos (fora do escopo original)

- Publicar no GitHub Pages para instalar no celular sem depender do PC.
- Sincronização geral entre aparelhos para notas que não foram compartilhadas.
- Sincronização geral entre aparelhos para atividades e notas não compartilhadas.

### Notificações push de atividades compartilhadas

O fluxo de envio usa a Edge Function `send-deadline-push` e o agendador do Supabase. Primeiro,
execute `shared-activity-push.sql` no SQL Editor para criar a tabela de deduplicação. Depois:

1. Gere um par VAPID no computador com `node scripts/generate-vapid.mjs`. Cadastre
   `VITE_VAPID_PUBLIC_KEY` como variável do repositório GitHub em **Settings → Secrets and
   variables → Actions → Variables**. No Supabase, em **Edge Functions → Secrets**, cadastre
   `VAPID_PRIVATE_KEY_JSON` com o valor privado JSON exibido pelo gerador.
2. Gere uma chave de agendamento com `node scripts/generate-cron-secret.mjs` e cadastre-a como
   `DEADLINE_PUSH_CRON_SECRET` nos secrets da Edge Function.
3. Instale a Supabase CLI, faça login e publique com
   `supabase functions deploy send-deadline-push --project-ref rcmssdqsbbxpjgumblfb`.
   A função valida a chave privada de agendamento mesmo com a verificação JWT desativada.
4. No arquivo `schedule-deadline-push.sql`, substitua `PREENCHA_COM_A_MESMA_CHAVE` pela chave
   gerada e execute o arquivo uma única vez no SQL Editor. Ele ativa o agendamento a cada 15 min.
5. Faça um novo deploy do GitHub Pages para incluir a chave pública no app. Em cada aparelho,
   abra **Ajustes → Lembretes de prazo** e ative as notificações. Se os lembretes locais já
   estavam ativados antes de configurar o push, desative e ative novamente para registrar o
   aparelho no serviço push.

O agendamento verifica os prazos a cada 15 minutos, respeita o fuso horário salvo em cada
dispositivo, envia alertas no dia anterior e no dia do vencimento, e remove inscrições inválidas.
O envio em segundo plano se aplica às atividades compartilhadas armazenadas no Supabase.

## Decisões de produto

- Nome provisório **Caderno**, centralizado em `src/config.ts`.
- Compartilhamento comum sem backend, por conteúdo autossuficiente.
- Colaboração em tempo real no Supabase, autenticada por sessão anônima e protegida por
  RLS e canais privados do Realtime.
- Imagens fora do `localStorage` (IndexedDB), para não estourar a cota.
- Sincronização PC ↔ celular manual, por backup.
- Service worker com precache de todos os arquivos, para o app abrir offline.
