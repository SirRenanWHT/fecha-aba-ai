/** Converte "#rrggbb" + alfa em rgba(), para tintas suaves sem depender de color-mix. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean
  const value = Number.parseInt(full, 16)
  if (Number.isNaN(value) || full.length !== 6) {
    return `rgba(176, 73, 43, ${alpha})`
  }
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
