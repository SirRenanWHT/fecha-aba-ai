"""Gera os ícones do PWA a partir de um desenho simples (C sobre fundo escuro)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

MASTER = 1024
INK = (36, 31, 25, 255)
PAPER = (255, 250, 244, 255)
ACCENT = (176, 73, 43, 255)

FONT_PATH = Path("C:/Windows/Fonts/georgiab.ttf")
FONT_SIZE = 690

image = Image.new("RGBA", (MASTER, MASTER), INK)
draw = ImageDraw.Draw(image)

font = ImageFont.truetype(str(FONT_PATH), FONT_SIZE)
# Centraliza o "C" opticamente (a fonte tem espaço à direita).
bbox = draw.textbbox((0, 0), "C", font=font)
text_width = bbox[2] - bbox[0]
text_height = bbox[3] - bbox[1]
x = (MASTER - text_width) / 2 - bbox[0]
y = (MASTER - text_height) / 2 - bbox[1] - 24
draw.text((x, y), "C", font=font, fill=PAPER)

# Ponto terracota, como um "ponto final" da marca.
dot_radius = 58
dot_center = (748, 760)
draw.ellipse(
    (
        dot_center[0] - dot_radius,
        dot_center[1] - dot_radius,
        dot_center[0] + dot_radius,
        dot_center[1] + dot_radius,
    ),
    fill=ACCENT,
)


def save(name: str, size: int) -> None:
    resized = image.resize((size, size), Image.LANCZOS)
    resized.save(OUT / name, format="PNG", optimize=True)
    print(f"{name}: {size}x{size}")


save("icon-192.png", 192)
save("icon-512.png", 512)
save("icon-maskable-512.png", 512)
save("apple-touch-icon.png", 180)
save("icon-32.png", 32)
