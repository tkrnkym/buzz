#!/usr/bin/env python3
"""Regenerate every app icon and launch image from the delivered master.

    pip install pillow
    python3 scripts/gen-app-icons.py

The master is `web/src/assets/nuxxicon1024.png`: a rounded square floating on
transparency, 1024px, with the NU / XX mark in #F5F5F7 on a vertical gradient
from #2F2F32 down to #0B0B0D. Nothing consumes it directly — every asset below
is derived from it, so this script is the only place the treatments are decided.

Two treatments, because the platforms want different things:

*Plate* — the square, opaque, with no corner radius baked in. iOS, Android and
the web client all round the icon themselves, so an asset that arrived
pre-rounded would be rounded twice and float inside a margin of its own. The
corners the artwork rounded off are filled back in per row from that row's own
colour, which continues the gradient rather than flattening the top corners to
black against a #2F2F32 edge.

*Mark* — the glyphs alone, on transparency. This is what the launch screens and
the Android adaptive foreground want: all three sit on a black background of
their own (see `launch_background.xml`, `LaunchScreen.storyboard`, and the
`ic_launcher_background` colour), so a plate would be a near-invisible square on
black. The mark is sized to take the same fraction of its canvas as the bee it
replaced, measured on the bee's longest side — the bee was wide and the NU / XX
mark is tall, so matching the width instead would have shrunk it by a third.

The vector favicon is written from the mark's geometry rather than traced: the
glyphs are 58 cells on a 40px grid, each an independently rounded square, which
is why the strokes carry seams instead of reading as solid bars.
"""

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "web/src/assets/nuxxicon1024.png"

# The master's square, inside its transparent margin.
PLATE_BOX = (100, 100, 924, 924)
# The mark's grid, measured off the master: 11x15 cells of 40px, the first at
# 32px in from the plate's edge, each rounded by 8.1% of a cell.
CELL = 40
GRID_ORIGIN = 32
CELL_RADIUS = 3.2
GLYPH = (245, 245, 247)
# How far above the plate a pixel has to sit before it counts as glyph.
NOISE_FLOOR = 12
# Where to read a row's plate colour. Not the edge: the artwork carries a light
# rim, so column 2 reads ~36 where the plate underneath is ~17, which is enough
# to make the rim itself register as glyph. 100 is inside the rim and outside
# the mark, whose first cell starts at 192.
PLATE_SAMPLE_X = 100

# Sizes are taken from the files being replaced, so a density that existed
# before still exists after.
IOS_APP_ICON = {
    "Icon-App-20x20@1x.png": 20,
    "Icon-App-20x20@2x.png": 40,
    "Icon-App-20x20@3x.png": 60,
    "Icon-App-29x29@1x.png": 29,
    "Icon-App-29x29@2x.png": 58,
    "Icon-App-29x29@3x.png": 87,
    "Icon-App-40x40@1x.png": 40,
    "Icon-App-40x40@2x.png": 80,
    "Icon-App-40x40@3x.png": 120,
    "Icon-App-60x60@2x.png": 120,
    "Icon-App-60x60@3x.png": 180,
    "Icon-App-76x76@1x.png": 76,
    "Icon-App-76x76@2x.png": 152,
    "Icon-App-83.5x83.5@2x.png": 167,
    "Icon-App-1024x1024@1x.png": 1024,
}
IOS_LAUNCH = {"LaunchImage.png": 168, "LaunchImage@2x.png": 336, "LaunchImage@3x.png": 504}
ANDROID_LAUNCHER = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ANDROID_FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
ANDROID_LAUNCH = {"mdpi": 288, "hdpi": 432, "xhdpi": 576, "xxhdpi": 864, "xxxhdpi": 1152}

# What fraction of its canvas the mark's longest side takes, per surface.
FOREGROUND_FRACTION = 294 / 432
LAUNCH_FRACTION = 912 / 1152
IOS_LAUNCH_FRACTION = 402 / 504


def load_plate() -> Image.Image:
    """The master's square, opaque, corners filled from each row's own colour.

    The row colour is read at the horizontal centre, which is the one column
    that is opaque on every row — `PLATE_SAMPLE_X` sits inside the artwork's
    rounded corner near the top and bottom, and reading transparency there fills
    those rows with black instead of continuing the gradient. The centre column
    falls in the gutter between the two glyph pairs; `mark_cells` asserts that.
    """
    crop = Image.open(MASTER).convert("RGBA").crop(PLATE_BOX)
    width, height = crop.size
    backdrop = Image.new("RGBA", crop.size)
    back, front = backdrop.load(), crop.load()
    for y in range(height):
        red, green, blue, _ = front[width // 2, y]
        for x in range(width):
            back[x, y] = (red, green, blue, 255)
    return Image.alpha_composite(backdrop, crop)


def load_mark() -> Image.Image:
    """The glyphs alone, cropped to their bounds, antialiasing preserved.

    Alpha comes from how far each pixel travelled from the plate towards the
    glyph colour, with the plate sampled on the same row — a fixed threshold
    would eat the edges at the top, where the plate is lightest. Anything within
    NOISE_FLOOR of the plate is taken as plate.

    Cropped to the grid's own box rather than to the alpha bounds: the artwork
    carries a light rim around the whole plate, and the rim clears any noise
    floor low enough to keep the glyph edges — cropping to alpha returns the
    entire square.
    """
    plate = load_plate()
    width, height = plate.size
    source = plate.load()
    mark = Image.new("RGBA", plate.size, GLYPH + (0,))
    target = mark.load()

    def luminance(pixel):
        return 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]

    for y in range(height):
        floor = luminance(source[PLATE_SAMPLE_X, y]) + NOISE_FLOOR
        span = luminance(GLYPH + (255,)) - floor
        for x in range(width):
            level = (luminance(source[x, y]) - floor) / span
            target[x, y] = GLYPH + (round(255 * min(1.0, max(0.0, level))),)
    return mark.crop(mark_cells()[1])


def write_plate(path: Path, size: int, keep_alpha: bool = False) -> None:
    icon = PLATE.resize((size, size), Image.LANCZOS)
    # iOS rejects an app icon with an alpha channel, and Android's legacy
    # launcher icons were RGB too. The plate is opaque either way.
    icon = icon.convert("RGBA" if keep_alpha else "RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    icon.save(path, optimize=True)


def write_mark(path: Path, canvas: int, fraction: float) -> None:
    long_side = round(canvas * fraction)
    width, height = MARK.size
    scale = long_side / max(width, height)
    scaled = MARK.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.LANCZOS)
    sheet = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    sheet.paste(scaled, ((canvas - scaled.width) // 2, (canvas - scaled.height) // 2), scaled)
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, optimize=True)


def mark_cells() -> tuple[list[str], tuple[int, int, int, int]]:
    """The mark as a grid of occupied cells, plus its box on the plate.

    Read rather than hard-coded so the favicon, the Flutter painter and the
    raster assets cannot drift: all of them come from this one measurement.
    """
    plate = load_plate()
    source = plate.load()
    size = plate.size[0]
    occupied = set()
    for row in range(size // CELL + 1):
        for column in range(size // CELL + 1):
            x = GRID_ORIGIN + CELL * column + CELL // 2
            y = GRID_ORIGIN + CELL * row + CELL // 2
            if x < size and y < size and source[x, y][0] > 150:
                occupied.add((column, row))
    first_column, last_column = min(c for c, _ in occupied), max(c for c, _ in occupied)
    first_row, last_row = min(r for _, r in occupied), max(r for _, r in occupied)
    grid = [
        "".join(
            "#" if (column, row) in occupied else "."
            for column in range(first_column, last_column + 1)
        )
        for row in range(first_row, last_row + 1)
    ]
    box = (
        GRID_ORIGIN + CELL * first_column,
        GRID_ORIGIN + CELL * first_row,
        GRID_ORIGIN + CELL * (last_column + 1),
        GRID_ORIGIN + CELL * (last_row + 1),
    )
    centre_column = (size // 2 - GRID_ORIGIN) // CELL
    if any((centre_column, row) in occupied for _, row in occupied):
        raise SystemExit("the plate's centre column carries glyph — see load_plate")
    return grid, box


def write_favicon(path: Path) -> None:
    grid, _ = mark_cells()
    columns, rows = len(grid[0]), len(grid)
    squares = "\n".join(
        f'  <rect class="mark" x="{column * CELL}" y="{row * CELL}" '
        f'width="{CELL}" height="{CELL}" rx="{CELL_RADIUS}"/>'
        for row, line in enumerate(grid)
        for column, glyph in enumerate(line)
        if glyph == "#"
    )
    path.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {columns * CELL} {rows * CELL}">\n'
        "  <style>\n"
        "    .mark { fill: #231e1e; }\n"
        "    @media (prefers-color-scheme: dark) {\n"
        "      .mark { fill: #f5f5f7; }\n"
        "    }\n"
        "  </style>\n"
        f"{squares}\n"
        "</svg>\n",
        encoding="utf-8",
    )


PLATE = load_plate()
MARK = load_mark()


def main() -> None:
    write_plate(ROOT / "web/src/assets/app-icon@3x.png", 512, keep_alpha=True)
    write_favicon(ROOT / "admin-web/public/favicon.svg")

    icons = ROOT / "mobile/ios/Runner/Assets.xcassets"
    for name, size in IOS_APP_ICON.items():
        write_plate(icons / "AppIcon.appiconset" / name, size)
    for name, size in IOS_LAUNCH.items():
        write_mark(icons / "LaunchImage.imageset" / name, size, IOS_LAUNCH_FRACTION)

    mipmap = ROOT / "mobile/android/app/src/main/res"
    for density, size in ANDROID_LAUNCHER.items():
        write_plate(mipmap / f"mipmap-{density}/ic_launcher.png", size)
        write_plate(mipmap / f"mipmap-{density}/ic_launcher_round.png", size)
    for density, size in ANDROID_FOREGROUND.items():
        write_mark(mipmap / f"mipmap-{density}/ic_launcher_foreground.png", size, FOREGROUND_FRACTION)
    for density, size in ANDROID_LAUNCH.items():
        write_mark(mipmap / f"mipmap-{density}/launch_image.png", size, LAUNCH_FRACTION)

    write_mark(ROOT / "mobile/assets/images/nuxx-icon.png", 600, 1.0)

    grid, box = mark_cells()
    print(f"mark grid {len(grid[0])}x{len(grid)}, {sum(line.count('#') for line in grid)} cells at {box}")
    for line in grid:
        print("   ", line)
    print(f"cell radius {CELL_RADIUS} ({100 * CELL_RADIUS / CELL:.1f}% of a cell)")
    print(f"plate {PLATE.size[0]}px, mark {MARK.size[0]}x{MARK.size[1]}")
    print(f"corner fill sanity: {math.isclose(PLATE.getchannel('A').getextrema()[0], 255)}")


if __name__ == "__main__":
    main()
