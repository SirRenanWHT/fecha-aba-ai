import { z } from 'zod'

export const FONT_FAMILIES = ['inter', 'lora', 'caveat', 'mono'] as const
export type FontFamily = (typeof FONT_FAMILIES)[number]

export const CARD_THEMES = ['auto', 'claro', 'escuro', 'papel'] as const
export type CardTheme = (typeof CARD_THEMES)[number]

export const noteSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  content: z.string(),
  coverImageId: z.string().optional(),
  fontFamily: z.enum(FONT_FAMILIES).default('inter'),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#b0492b'),
  cardTheme: z.enum(CARD_THEMES).default('auto'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Note = z.infer<typeof noteSchema>

export const FONT_LABELS: Record<FontFamily, string> = {
  inter: 'Inter',
  lora: 'Lora',
  caveat: 'Caveat',
  mono: 'Mono',
}

export const FONT_HINTS: Record<FontFamily, string> = {
  inter: 'Sóbria e limpa',
  lora: 'Serifada, editorial',
  caveat: 'Manuscrita',
  mono: 'Técnica, de código',
}

export const FONT_STACKS: Record<FontFamily, string> = {
  inter: "'Inter Variable', 'Segoe UI', system-ui, sans-serif",
  lora: "'Lora Variable', Georgia, 'Times New Roman', serif",
  caveat: "'Caveat Variable', 'Comic Sans MS', cursive",
  mono: "'JetBrains Mono Variable', ui-monospace, 'Cascadia Code', Consolas, monospace",
}

export const CARD_THEME_LABELS: Record<CardTheme, string> = {
  auto: 'Automático',
  claro: 'Claro',
  escuro: 'Escuro',
  papel: 'Papel',
}

export const CARD_THEME_HINTS: Record<CardTheme, string> = {
  auto: 'Segue o tema',
  claro: 'Sempre claro',
  escuro: 'Sempre escuro',
  papel: 'Tom quente',
}

export const ACCENT_PRESETS = [
  { name: 'Terracota', value: '#b0492b' },
  { name: 'Oliva', value: '#6c7a4a' },
  { name: 'Mostarda', value: '#b7832f' },
  { name: 'Oceano', value: '#3e6b7d' },
  { name: 'Ameixa', value: '#7a4a68' },
  { name: 'Grafite', value: '#5b5852' },
] as const
