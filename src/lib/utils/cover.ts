export function coverTransform(positionX: number, positionY: number, zoom: number): string {
  const extraZoom = zoom - 100
  const translateX = ((50 - positionX) / 50) * (extraZoom / 2)
  const translateY = ((50 - positionY) / 50) * (extraZoom / 2)
  return `translate(${translateX}%, ${translateY}%) scale(${zoom / 100})`
}
