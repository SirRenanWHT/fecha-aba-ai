# Caderno

App de notas e atividades que roda direto no navegador — no PC e no celular — com os
dados salvos no próprio aparelho. A proposta é ser instalável como PWA (sem APK),
offline e sem conta.

**Status: Fase 5 concluída — app completo.** Notas com rich text, fontes, capas,
compartilhamento e backup; atividades com progresso e kanban; PWA instalável que
funciona offline depois da primeira visita.

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
  citação, links e limpar formatação. Todo conteúdo é sanitizado com DOMPurify antes
  de ser salvo.
- **Fontes por nota**: Inter, Lora, Caveat (manuscrita) e Mono — aplicadas no editor e
  no card.
- **Estilo do card**: 6 cores de destaque + cor personalizada e quatro temas
  (automático, claro, escuro, papel). O tema da nota vale para o card **e** para a
  folha do editor — a moldura do app continua com o tema do Caderno.
- **Imagem de capa**: escolher da galeria ou tirar foto; redimensionada para até
  1600 px e comprimida em WebP (~380 KB) no IndexedDB. O `localStorage` guarda só o id.
- **Organização**: busca por título/conteúdo/tags (atalho `/`), filtro por tags
  combináveis, abas Todas / Fixadas / Arquivadas, tags e data relativa.
- **Fluxo**: salvamento automático, excluir com desfazer, fixar e arquivar.

### Atividades

- **Status**: a fazer, em andamento, pausada e concluída.
- **Progresso**: automático pelas subtarefas ou manual (0–100%). Concluir todas as
  subtarefas conclui a atividade; baixar o progresso manual reabre.
- **Planejamento**: prazo com destaque de atrasadas, prioridade (baixa/média/alta) e
  projeto.
- **Visualizações**: lista com resumo geral e filtros, e kanban em quatro colunas com
  troca de etapa pelo seletor do card.
- **Exportar/importar atividades**: arquivo `.json` próprio, com cópias na importação.
- **Backup**: as atividades entram no backup completo ao lado das notas e imagens.

### Compartilhar e backup

- **Link autossuficiente**: o conteúdo da nota (incluindo capa, quando couber) é
  comprimido e vai dentro do próprio link, sem servidor. Quem abre vê uma prévia e
  importa uma cópia editável.
- **Arquivo `.caderno.json`**: alternativa para notas com imagem, já que o link fica
  grande demais para aplicativos de mensagem.
- **Web Share API**: no celular, o botão “Compartilhar…” usa o compartilhamento nativo;
  no desktop ele é escondido e ficam “Copiar link” e “Baixar arquivo”.
- **Backup completo**: exporta todas as notas, imagens de capa e preferências em um
  único JSON. Na restauração, você escolhe **mesclar** (adiciona cópias) ou
  **substituir tudo** (apaga o que existe antes).
- **Importar uma nota avulsa**: o botão “Importar” na lista de notas (e em Ajustes)
  abre a prévia de um `.caderno.json` sem passar pelo backup.

### Base

- **Tema**: claro (papel), escuro e sistema — aplicado na hora e lembrado.
- **Persistência**: `localStorage` versionado (`ndb:v2:*`), validado com Zod.
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

Nada sai do aparelho. Notas, atividades e preferências ficam no `localStorage`; imagens
de capa ficam no IndexedDB (`ndb-images`). Compartilhar um link ou baixar um arquivo é
sempre uma ação explícita sua — o conteúdo viaja dentro do link/arquivo, sem servidor.
**Ajustes → Zona de risco** apaga notas, atividades, imagens e preferências.

## Próximos passos (fora do escopo original)

- Publicar no GitHub Pages para instalar no celular sem depender do PC.
- Sincronização automática entre PC e celular (hoje é manual, por backup).
- Lembretes de prazo e notificações.
- Compartilhar atividades individuais por link, como já acontece com as notas.

## Decisões de produto

- Nome provisório **Caderno**, centralizado em `src/config.ts`.
- Compartilhamento sem backend, por conteúdo autossuficiente.
- Imagens fora do `localStorage` (IndexedDB), para não estourar a cota.
- Sincronização PC ↔ celular manual, por backup.
- Service worker com precache de todos os arquivos, para o app abrir offline.
