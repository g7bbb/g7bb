"""곤충본부 로고 원본(.ai)에서 앱에 쓰는 로고·아이콘 PNG 를 다시 만듭니다.

    pip install pymupdf pillow numpy
    python tools/brand/make_brand.py      (저장소 맨 위 폴더에서 실행)

- .ai 파일은 PDF 호환이라 PyMuPDF 로 바로 읽힙니다. 한 장에 로고가 두 개(화난 눈 / 동그란 눈) 있고
  **왼쪽(화난 눈)** 을 씁니다.
- 원본의 "검정"이 살짝 옅은 검정이라(불투명도 224/255) 그대로 쓰면 흰 로고가 회색으로 나옵니다.
  그래서 불투명도를 끝까지 끌어올립니다.
- 앱 바탕이 거의 검정이라 흰색판, 종이·초록 버튼용 검은색판을 따로 만듭니다.
- 아이콘은 흰 바탕입니다 (투명이면 아이폰이 검게 채워 로고가 사라짐).
"""
import numpy as np
import pymupdf
from PIL import Image

doc = pymupdf.open('tools/brand/print-GOB.ai')
pix = doc[0].get_pixmap(dpi=600, clip=pymupdf.Rect(60, 250, 300, 500), alpha=False)
gray = Image.frombytes('RGB', (pix.width, pix.height), pix.samples).convert('L')
alpha = 255 - np.array(gray)
top = np.percentile(alpha[alpha > 10], 90)
alpha = np.clip(alpha.astype(float) * 255 / top, 0, 255).astype(np.uint8)

full = Image.fromarray(alpha)
full = full.crop(full.getbbox())
# 마스코트와 "곤충본부" 글씨 사이의 빈 줄에서 자릅니다.
rows = (np.array(full) > 10).any(axis=1)
gap = next(i for i in range(len(rows) // 2, len(rows)) if not rows[i])
mark = full.crop((0, 0, full.size[0], gap))
mark = mark.crop(mark.getbbox())


def colored(al, color, h, pad=0.03):
    al = al.resize((round(al.size[0] * h / al.size[1]), h), Image.LANCZOS)
    p = round(max(al.size) * pad)
    out = Image.new('RGBA', (al.size[0] + 2 * p, al.size[1] + 2 * p), (0, 0, 0, 0))
    solid = Image.new('RGBA', al.size, color + (255,))
    solid.putalpha(al)
    out.paste(solid, (p, p), solid)
    return out


def icon(size, inner):
    s = inner * size / max(mark.size)
    al = mark.resize((round(mark.size[0] * s), round(mark.size[1] * s)), Image.LANCZOS)
    solid = Image.new('RGBA', al.size, (0, 0, 0, 255))
    solid.putalpha(al)
    bg = Image.new('RGB', (size, size), (255, 255, 255))
    bg.paste(solid, ((size - al.size[0]) // 2, (size - al.size[1]) // 2), solid)
    return bg


for name, c in [('black', (0, 0, 0)), ('white', (255, 255, 255))]:
    colored(full, c, 900).save(f'public/brand/logo-{name}.png', optimize=True)
    colored(mark, c, 600).save(f'public/brand/mark-{name}.png', optimize=True)
icon(512, 0.78).save('app/icon.png', optimize=True)
icon(180, 0.78).save('app/apple-icon.png', optimize=True)
icon(192, 0.66).save('public/brand/icon-192.png', optimize=True)
icon(512, 0.66).save('public/brand/icon-512.png', optimize=True)
print('done')
