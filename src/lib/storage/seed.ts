import type { Note } from '@/lib/model/note'
import { plainTextToHtml } from '@/lib/utils/html'

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

/**
 * Conteúdo de exemplo criado apenas na primeira abertura do app.
 * Serve para apresentar a interface e dar algo concreto para editar.
 */
export function createSeedNotes(): Note[] {
  return [
    {
      id: 'seed-bem-vindo',
      title: 'Bem-vindo ao Caderno',
      content: plainTextToHtml(
        'Este é o seu espaço para guardar ideias, listas e projetos.\n\n' +
          'Agora cada nota pode ter a sua própria fonte, uma cor de destaque, um tema de card ' +
          'e uma imagem de capa. Use o botão de estilo no topo do editor para experimentar.\n\n' +
          'Tudo continua salvo neste aparelho, no armazenamento local do navegador — nada é ' +
          'enviado para a internet.\n\n' +
          'Dica: use o botão "+" para começar uma nota nova.',
      ),
      fontFamily: 'inter',
      accentColor: '#b0492b',
      cardTheme: 'auto',
      tags: ['caderno'],
      pinned: true,
      archived: false,
      createdAt: hoursAgo(2),
      updatedAt: hoursAgo(2),
    },
    {
      id: 'seed-ideias',
      title: 'Ideias para o app',
      content: plainTextToHtml(
        'Anotar o que quero ver nas próximas fases:\n\n' +
          '• Compartilhar nota por link ou arquivo\n' +
          '• Atividades com status, prazo e progresso\n' +
          '• Backup completo para levar do PC ao celular\n' +
          '• Modo offline instalável no celular',
      ),
      fontFamily: 'lora',
      accentColor: '#6c7a4a',
      cardTheme: 'papel',
      tags: ['produto', 'ideias'],
      pinned: false,
      archived: false,
      createdAt: hoursAgo(26),
      updatedAt: hoursAgo(20),
    },
    {
      id: 'seed-compras',
      title: 'Lista de compras do mês',
      content: plainTextToHtml(
        'Mercado:\n' +
          '- Café em grãos\n' +
          '- Aveia e granola\n' +
          '- Frutas da estação\n' +
          '- Azeite\n' +
          '- Pão de fermentação natural\n\n' +
          'Casa:\n' +
          '- Detergente\n' +
          '- Sacos de lixo\n' +
          '- Lâmpada da sala',
      ),
      fontFamily: 'inter',
      accentColor: '#b7832f',
      cardTheme: 'auto',
      tags: ['casa', 'compras'],
      pinned: false,
      archived: false,
      createdAt: hoursAgo(50),
      updatedAt: hoursAgo(48),
    },
    {
      id: 'seed-trecho',
      title: 'Trecho que quero lembrar',
      content: plainTextToHtml(
        '“A atenção é a forma mais rara e mais pura de generosidade.”\n\n' +
          '— Simone Weil\n\n' +
          'Guardar para reler quando o dia parecer corrido demais.',
      ),
      fontFamily: 'caveat',
      accentColor: '#7a4a68',
      cardTheme: 'papel',
      tags: ['leitura'],
      pinned: false,
      archived: false,
      createdAt: hoursAgo(96),
      updatedAt: hoursAgo(96),
    },
  ]
}
