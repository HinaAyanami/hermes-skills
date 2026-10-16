#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Contact sheet from a video at chosen timestamps — one frame per scene.

Use this instead of a uniform fps filter: uniform sampling lands twice inside a
long scene and skips short ones, which reads as "a scene is missing".

Usage:
  python contact_sheet.py in.mp4 out.png 3 8 13 18 24 31 38 43 48 53 58

Pick one stable moment per scene (mid-scene, after the entrance transition).
"""
import subprocess
import sys

from PIL import Image


def main():
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    times = [float(x) for x in sys.argv[3:]]

    W, H = 480, 270
    cols = min(4, len(times))
    rows = (len(times) + cols - 1) // cols

    frames = []
    for i, t in enumerate(times):
        p = '_cs_%d.png' % i
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t), '-i', src,
                        '-frames:v', '1', p], check=True)
        frames.append(Image.open(p).resize((W, H)))

    sheet = Image.new('RGB', (W * cols, H * rows), (10, 10, 14))
    for i, im in enumerate(frames):
        sheet.paste(im, ((i % cols) * W, (i // cols) * H))
    sheet.save(dst)
    print('%s ok (%d frames at %s)' % (dst, len(times), times))


if __name__ == '__main__':
    main()
