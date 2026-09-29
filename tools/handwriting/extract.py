#!/usr/bin/env python3
"""손글씨 사진/그림 → 투명 PNG (배틀 효과 글씨용).

Jin 이 쓴 글씨를 받아서 배경을 지우고 **글자 모양만** 남긴 PNG 를 만듭니다.
2026-09-29 에 만들었고, 진짜 폰 사진과 Zen Brush 캡쳐 둘 다로 확인했습니다.

    python3 tools/handwriting/extract.py 사진.jpg 결과.png --rotate-left

⚠️ **출력은 RGB=흰색, 알파=먹물 진하기 형태입니다.**
   CSS `mask-image` 로 쓰면 색을 앱에서 입힐 수 있습니다.
   기술마다 글자 색이 달라서(빨강·금색·하늘색…) 색을 구워 넣으면
   같은 글자를 색깔별로 다시 써야 합니다.

세 가지를 처리합니다.

1. **조명 얼룩 펴기** — 폰으로 종이를 찍으면 한쪽이 어둡고 그림자가 집니다.
   그냥 밝기로 자르면 그늘진 종이가 글자로 잡혀 시커먼 덩어리가 됩니다.
   (실측: 밝기가 241→110 으로 변하는 사진에서 단순 방식은 그늘진 종이의
   **94.7% 를 글자로 오해**했습니다. 이 방식은 0% 입니다.)

2. **워터마크 지우기** — Zen Brush 무료판은 좌상단·우하단에 **갈색** 배너를 넣습니다.
   붓글씨는 무채색이므로 **색이 있는 픽셀**만 골라 지웁니다.
   ⚠️ 처음에는 모서리를 대각선으로 통째로 잘랐는데 **획까지 11% 날아갔습니다**.
   지금은 배너 픽셀만 지우고, 위쪽만 삼각형으로 마저 지웁니다(앱 아이콘이 회색이라
   색으로 안 잡힘). 잘림 0.78% 로 내려갔습니다.

3. **왼쪽으로 90도 돌리기** (`--rotate-left`) — Zen Brush 는 가로 모드가 없어서
   Jin 이 **글씨를 옆으로 눕혀서** 씁니다. 그걸 세워주는 용도입니다.
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageFilter


def strip_banner(im: Image.Image) -> np.ndarray:
    """갈색 워터마크 배너를 지우고 흑백 배열로 돌려줍니다."""
    rgb = np.asarray(im.convert('RGB'), dtype=np.float32)
    H, W, _ = rgb.shape
    sat = rgb.max(axis=2) - rgb.min(axis=2)      # 0 이면 무채색(=붓글씨)
    gray = rgb.mean(axis=2)

    banner = Image.fromarray(((sat > 12) * 255).astype(np.uint8))
    for _ in range(3):                            # 배너 주변으로 조금 넓힘
        banner = banner.filter(ImageFilter.MaxFilter(9))
    b = np.asarray(banner) > 0
    if not b.any():
        return gray                               # 배너 없는 사진(종이 촬영 등)

    yy, xx = np.mgrid[0:H, 0:W]
    d = xx / W + yy / H                           # 0 = 왼쪽위, 2 = 오른쪽아래
    kill = b
    # 위쪽 배너 안에는 회색 앱 아이콘이 있어 색으로는 안 잡힙니다 → 삼각형으로 마저 지웁니다.
    # 아래쪽은 글자가 가까우므로 배너 픽셀만 지웁니다(삼각형으로 자르면 획이 잘립니다).
    top = d[b & (d < 1)]
    if top.size:
        kill = kill | (d < top.max())
    return np.where(kill, 255.0, gray)


def extract(src: str, dst: str, rotate_left: bool = False,
            max_edge: int = 1400, margin: int = 24) -> dict:
    im = Image.open(src)
    w0, h0 = im.size
    a = strip_banner(im)

    # ── 조명 얼룩 펴기 ─────────────────────────────────
    # 종이만 남을 만큼 크게 흐린 판 = "이 자리의 종이는 원래 이 밝기".
    # 원본을 그걸로 나누면 그늘진 쪽도 흰 종이로 평평해집니다.
    radius = max(w0, h0) // 20
    paper = Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    flat = np.clip(a / np.maximum(np.asarray(paper, dtype=np.float32), 1.0), 0, 1.5)

    # ── 먹물 진하기를 알파로 ───────────────────────────
    # 딱 잘라 이분법으로 하지 않습니다 — 획 가장자리가 톱니처럼 거칠어집니다.
    INK_FULL, PAPER = 0.45, 0.88
    alpha = np.clip((PAPER - flat) / (PAPER - INK_FULL), 0, 1)
    alpha[alpha < 0.12] = 0                       # 종이 결·연필 자국은 버림

    ys, xs = np.nonzero(alpha > 0.35)
    if len(xs) == 0:
        raise SystemExit('먹물을 못 찾았어요. 더 진한 펜으로 쓰거나 밝은 곳에서 다시 찍어 주세요.')
    x0, x1 = max(xs.min() - margin, 0), min(xs.max() + margin, alpha.shape[1] - 1)
    y0, y1 = max(ys.min() - margin, 0), min(ys.max() + margin, alpha.shape[0] - 1)
    alpha = alpha[y0:y1 + 1, x0:x1 + 1]

    h, w = alpha.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = 255                           # 색은 CSS 마스크로 입힙니다
    rgba[..., 3] = (alpha * 255).astype(np.uint8)
    out = Image.fromarray(rgba, 'RGBA')

    if rotate_left:
        out = out.transpose(Image.ROTATE_90)      # 눕혀 쓴 글씨를 세웁니다
    if max(out.size) > max_edge:
        out.thumbnail((max_edge, max_edge), Image.LANCZOS)
    out.save(dst, optimize=True)

    return {
        '원본': f'{w0}×{h0}',
        '저장': f'{out.size[0]}×{out.size[1]}',
        '가로:세로': f'{out.size[0] / out.size[1]:.2f} : 1',
        '파일': f'{os.path.getsize(dst) / 1024:.0f}KB',
    }


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='손글씨 사진 → 투명 PNG')
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--rotate-left', action='store_true',
                    help='옆으로 눕혀 쓴 글씨를 왼쪽으로 90도 돌려 세웁니다')
    args = ap.parse_args()
    for k, v in extract(args.src, args.dst, args.rotate_left).items():
        print(f'{k}: {v}')
