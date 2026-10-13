#!/usr/bin/env python3
"""Cut one person out of a photo, with nobody else left in it.

    python3 -I .claude/skills/productora/scripts/recorte.py <photo.jpg> <out.png>
        [--crop x0,y0,x1,y1] [--add "x,y x,y x,y ..."]... [--erase x0,y0,x1,y1]... [--seed x,y]

Gym photos always catch other people. A cut-out puts the person on a brand background and
leaves the rest of the gym behind, as the personal-brand templates in templates/marca/ do.

1. --crop narrows the photo to the person first. The model does better with less around them.
2. `npx hyperframes remove-background` removes the background with a local model (nothing is
   uploaded).
3. The largest shape is kept (or the one under --seed), its holes are filled and its edge is
   softened by about a pixel.

Look at <out>-check.jpg before using the cut-out. The model drops things:
  - a phone held in front of the face, and other light objects close to the body,
  - dark hair against a dark machine (it turns see-through),
  - a scrunchie or a strap at the edge.
Put them back with --add: a polygon in crop coordinates, filled with the photo's own pixels
(draw a grid over the crop to read the coordinates). Blank out a person standing next to the
subject with --erase. Then run again.

Needs numpy, pillow and scipy (`pip install scipy` once).
"""
import argparse
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

try:
    from scipy import ndimage
except ImportError:
    sys.exit("recorte.py needs scipy: pip install scipy")


def box(text):
    vals = [int(v) for v in text.split(",")]
    if len(vals) != 4:
        raise argparse.ArgumentTypeError("expected x0,y0,x1,y1")
    return vals


def polygon(text):
    pts = [tuple(int(v) for v in p.split(",")) for p in text.split()]
    if len(pts) < 3:
        raise argparse.ArgumentTypeError("a polygon needs at least three x,y points")
    return pts


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("photo")
    ap.add_argument("out")
    ap.add_argument("--crop", type=box, help="x0,y0,x1,y1 in photo pixels")
    ap.add_argument("--add", type=polygon, action="append", default=[], help='"x,y x,y x,y" in crop pixels')
    ap.add_argument("--erase", type=box, action="append", default=[], help="x0,y0,x1,y1 in crop pixels")
    ap.add_argument("--seed", help="x,y inside the person, in crop pixels (default: the largest shape)")
    args = ap.parse_args()

    photo = ImageOps.exif_transpose(Image.open(args.photo)).convert("RGB")
    crop = photo.crop(tuple(args.crop)) if args.crop else photo
    work = tempfile.mkdtemp(prefix="recorte-")
    src = os.path.join(work, "crop.png")
    cut = os.path.join(work, "cut.png")
    crop.save(src)
    subprocess.run(["npx", "-y", "hyperframes", "remove-background", src, "-o", cut], check=True, stdout=subprocess.DEVNULL)

    a = np.array(Image.open(cut).convert("RGBA"))[..., 3].astype(np.float32)
    if args.add:
        mask = Image.new("L", crop.size, 0)
        draw = ImageDraw.Draw(mask)
        for pts in args.add:
            draw.polygon(pts, fill=255)
        a = np.maximum(a, np.array(mask.filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32))
    for x0, y0, x1, y1 in args.erase:
        a[y0:y1, x0:x1] = 0

    solid = a > 24
    labels, n = ndimage.label(solid)
    if not n:
        sys.exit("the model found nobody in the photo")
    if args.seed:
        x, y = (int(v) for v in args.seed.split(","))
        keep = labels[y, x]
        if not keep:
            sys.exit(f"--seed {args.seed} is not on the person")
    else:
        keep = int(np.argmax(ndimage.sum(solid, labels, range(1, n + 1)))) + 1
    person = ndimage.binary_fill_holes(labels == keep)
    a = np.where(person, np.maximum(a, ndimage.binary_erosion(person, iterations=2) * 255.0), 0)

    alpha = np.array(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)))
    img = Image.fromarray(np.dstack([np.array(crop), alpha]))
    bbox = img.getbbox()
    img = img.crop(bbox)
    img.save(args.out)

    check = Image.new("RGBA", img.size, (24, 32, 61, 255))
    check.alpha_composite(img)
    check.convert("RGB").save(os.path.splitext(args.out)[0] + "-check.jpg", quality=88)
    print(f"{args.out} {img.size[0]}x{img.size[1]} (crop {crop.size[0]}x{crop.size[1]}, trimmed at {bbox[0]},{bbox[1]})")


if __name__ == "__main__":
    main()
