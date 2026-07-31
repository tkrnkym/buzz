import 'package:flutter/material.dart';

/// Name of the first-party Nuxx theme. Nuxx reuses the GitHub Light palette for
/// every base color; the one thing that sets it apart is a branded gradient
/// painted across the app's top section. Mirrors desktop, where the same
/// gradient fills the sidebar canvas — see `data-nuxx-sidebar` in
/// `desktop/src/shared/styles/globals/theme.css`.
const nuxxThemeName = 'nuxx';

/// Name of the dark counterpart, which reuses the GitHub Dark palette and the
/// dark-tuned gradient stops. Paired with [nuxxThemeName] in `themePairs`, so
/// the two behave as a single "Nuxx" choice under System mode.
const nuxxDarkThemeName = 'nuxx-dark';

/// Whether [themeName] is either half of the Nuxx pair. Both halves enable the
/// gradient so System mode keeps it on across an OS light/dark switch.
bool isNuxxTheme(String themeName) =>
    themeName == nuxxThemeName || themeName == nuxxDarkThemeName;

/// Gradient stops, matching desktop's `--nuxx-gradient-*` custom properties.
const _lightTop = Color(0xFFE6E6B6);
const _lightBottom = Color(0xFFC4D0DA);
const _darkTop = Color(0xFF4A4616);
const _darkBottom = Color(0xFF0A1423);

/// The Nuxx gradient for the app's top section, or null when [themeName] is not
/// a Nuxx theme — in which case the section keeps its default frosted fill.
///
/// The stops are fully opaque: under Nuxx the color replaces the frosted
/// treatment rather than tinting it, matching desktop's solid sidebar canvas.
///
/// [brightness] comes from the applied color scheme rather than the theme name,
/// so System mode picks the right stops as the OS switches.
LinearGradient? nuxxTopSectionGradient(
  String themeName,
  Brightness brightness,
) {
  if (!isNuxxTheme(themeName)) return null;

  final isDark = brightness == Brightness.dark;
  return LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [
      isDark ? _darkTop : _lightTop,
      isDark ? _darkBottom : _lightBottom,
    ],
  );
}
