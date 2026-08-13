import 'dart:math' show min;

import 'package:flutter/material.dart';

/// The Nuxx mark: NU over XX, drawn rather than loaded.
///
/// Drawn because the mark is monochrome and the onboarding screen paints it in
/// the screen's own ink — an image asset would freeze one colour, and the
/// screen it appears on is deliberately outside the theme.
///
/// The geometry is the app icon's: 58 cells on an 11x15 grid, each an
/// independently rounded square. The seams that leaves along a stroke are the
/// mark, not an artifact — `scripts/gen-app-icons.py` reads the same grid off
/// the master to write the raster icons and the favicon, so the three cannot
/// drift apart.
///
/// This replaced a bee whose wings fluttered on tap. The mark has no wings, so
/// there is nothing left to animate and the widget is static: a tap target that
/// does nothing visible would be worse than no tap target.
const List<String> _grid = [
  '#...#.#...#',
  '##..#.#...#',
  '#.#.#.#...#',
  '#..##.#...#',
  '#...#.#...#',
  '#...#.#...#',
  '#...#..###.',
  '...........',
  '#...#.#...#',
  '#...#.#...#',
  '.#.#...#.#.',
  '..#.....#..',
  '.#.#...#.#.',
  '#...#.#...#',
  '#...#.#...#',
];

/// A cell's corner radius, as a fraction of the cell.
const double _cellRadius = 0.08;

class NuxxMark extends StatelessWidget {
  /// The rendered length of the mark's longest side.
  ///
  /// The longest side rather than the width, because the mark is taller than it
  /// is wide and the bee it replaced was wider than it was tall — sizing both
  /// by width would have made this one half again as large everywhere it
  /// appears.
  final double size;

  /// The colour the mark is painted in.
  final Color color;

  const NuxxMark({required this.size, required this.color, super.key});

  @override
  Widget build(BuildContext context) {
    final columns = _grid.first.length;
    final rows = _grid.length;
    final cell = size / rows;

    return Semantics(
      label: 'Nuxx',
      image: true,
      child: RepaintBoundary(
        child: CustomPaint(
          size: Size(cell * columns, cell * rows),
          painter: _NuxxMarkPainter(color: color),
        ),
      ),
    );
  }
}

class _NuxxMarkPainter extends CustomPainter {
  final Color color;

  const _NuxxMarkPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final columns = _grid.first.length;
    final rows = _grid.length;
    final cell = min(size.width / columns, size.height / rows);
    final paint = Paint()..color = color;
    final radius = Radius.circular(cell * _cellRadius);

    final left = (size.width - cell * columns) / 2;
    final top = (size.height - cell * rows) / 2;

    for (var row = 0; row < rows; row++) {
      final line = _grid[row];
      for (var column = 0; column < columns; column++) {
        if (line[column] != '#') continue;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(left + cell * column, top + cell * row, cell, cell),
            radius,
          ),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_NuxxMarkPainter oldDelegate) =>
      color != oldDelegate.color;
}
