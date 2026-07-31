import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nuxx/shared/theme/theme.dart';
import 'package:nuxx/shared/widgets/frosted_app_bar.dart';

void main() {
  group('Nuxx theme catalog entries', () {
    test('both halves are in the catalog', () {
      expect(findTheme(nuxxThemeName), isNotNull);
      expect(findTheme(nuxxDarkThemeName), isNotNull);
    });

    test('borrow the GitHub palettes', () {
      final nuxx = findTheme(nuxxThemeName)!;
      final github = findTheme('github-light')!;
      expect(nuxx.bg, github.bg);
      expect(nuxx.fg, github.fg);
      expect(nuxx.comment, github.comment);

      final nuxxDark = findTheme(nuxxDarkThemeName)!;
      final githubDark = findTheme('github-dark')!;
      expect(nuxxDark.bg, githubDark.bg);
      expect(nuxxDark.fg, githubDark.fg);
      expect(nuxxDark.comment, githubDark.comment);
    });

    test('are a light/dark pair', () {
      expect(findTheme(nuxxThemeName)!.isDark, isFalse);
      expect(findTheme(nuxxDarkThemeName)!.isDark, isTrue);
      expect(themePairFor(nuxxThemeName), nuxxDarkThemeName);
      expect(themePairFor(nuxxDarkThemeName), nuxxThemeName);
    });

    test('appear as a single System-mode option labelled "Nuxx"', () {
      final paired = themeGroups().paired.map((t) => t.name);
      expect(paired, contains(nuxxThemeName));
      expect(paired, isNot(contains(nuxxDarkThemeName)));
      expect(pairedThemeLabel(nuxxThemeName), 'Nuxx');
      expect(themeSelectionLabel(nuxxThemeName, ThemeMode.system), 'Nuxx');
      expect(themeSelectionLabel(nuxxDarkThemeName, ThemeMode.system), 'Nuxx');
    });

    test('resolve across brightnesses like any other pair', () {
      final resolved = resolveSchemes(nuxxThemeName, ThemeMode.system);
      expect(resolved.forcedMode, isNull);
      expect(resolved.light.brightness, Brightness.light);
      expect(resolved.dark.brightness, Brightness.dark);
      expect(resolved.lightTheme?.name, nuxxThemeName);
      expect(resolved.darkTheme?.name, nuxxDarkThemeName);

      expect(
        effectiveTheme(nuxxThemeName, ThemeMode.dark)?.name,
        nuxxDarkThemeName,
      );
      expect(
        effectiveTheme(nuxxDarkThemeName, ThemeMode.light)?.name,
        nuxxThemeName,
      );
    });

    test(
      'fallbacks expose the effective Nuxx theme for gradient selection',
      () {
        final coerced = resolveSchemes('nord', ThemeMode.light);
        expect(coerced.lightTheme?.name, nuxxThemeName);
        expect(
          nuxxTopSectionGradient(
            coerced.lightTheme!.name,
            coerced.light.brightness,
          ),
          isNotNull,
        );

        final unknown = resolveSchemes('not-a-theme', ThemeMode.light);
        expect(unknown.lightTheme?.name, nuxxThemeName);
        expect(
          nuxxTopSectionGradient(
            unknown.lightTheme!.name,
            unknown.light.brightness,
          ),
          isNotNull,
        );
      },
    );
  });

  group('nuxxTopSectionGradient', () {
    test('is null for non-Nuxx themes', () {
      expect(nuxxTopSectionGradient('github-light', Brightness.light), isNull);
      expect(nuxxTopSectionGradient('nord', Brightness.dark), isNull);
    });

    test('paints top to bottom for both halves of the pair', () {
      for (final name in [nuxxThemeName, nuxxDarkThemeName]) {
        final gradient = nuxxTopSectionGradient(name, Brightness.light);
        expect(gradient, isNotNull, reason: '$name should be gradient-backed');
        expect(gradient!.begin, Alignment.topCenter);
        expect(gradient.end, Alignment.bottomCenter);
        expect(gradient.colors, hasLength(2));
      }
    });

    test('brightness selects the stops, not the theme name', () {
      // Both halves enable the gradient, so System mode keeps it on across an
      // OS switch — the applied brightness alone decides which stops are used.
      final light = nuxxTopSectionGradient(nuxxThemeName, Brightness.light)!;
      final dark = nuxxTopSectionGradient(nuxxThemeName, Brightness.dark)!;

      expect(light.colors, isNot(dark.colors));
      expect(
        nuxxTopSectionGradient(nuxxDarkThemeName, Brightness.dark)!.colors,
        dark.colors,
      );
      expect(
        nuxxTopSectionGradient(nuxxDarkThemeName, Brightness.light)!.colors,
        light.colors,
      );
    });

    test('is opaque so the color replaces the frosted fill', () {
      for (final brightness in Brightness.values) {
        final gradient = nuxxTopSectionGradient(nuxxThemeName, brightness)!;
        for (final color in gradient.colors) {
          expect(color.a, 1.0);
        }
      }
    });
  });

  group('theme threading', () {
    BoxDecoration barDecoration(WidgetTester tester) {
      final container = tester
          .widgetList<Container>(
            find.descendant(
              of: find.byType(FrostedAppBar),
              matching: find.byType(Container),
            ),
          )
          .first;
      return container.decoration! as BoxDecoration;
    }

    Widget harness(ThemeData theme) => MaterialApp(
      theme: theme,
      home: Builder(
        builder: (context) => Stack(
          children: [
            FrostedAppBar(
              gradient: context.appColors.topSectionGradient,
              title: const Text('Home'),
            ),
          ],
        ),
      ),
    );

    testWidgets('AppTheme carries the gradient to the top section', (
      tester,
    ) async {
      await tester.pumpWidget(
        harness(
          AppTheme.light(
            topSectionGradient: nuxxTopSectionGradient(
              nuxxThemeName,
              Brightness.light,
            ),
          ),
        ),
      );

      final decoration = barDecoration(tester);
      expect(decoration.gradient, isNotNull);
      // A BoxDecoration cannot paint a color and a gradient at once.
      expect(decoration.color, isNull);
    });

    testWidgets('non-Nuxx themes keep the frosted surface fill', (
      tester,
    ) async {
      await tester.pumpWidget(harness(AppTheme.light()));

      final decoration = barDecoration(tester);
      expect(decoration.gradient, isNull);
      expect(decoration.color, isNotNull);
    });
  });

  group('isNuxxTheme', () {
    test('matches only the Nuxx pair', () {
      expect(isNuxxTheme(nuxxThemeName), isTrue);
      expect(isNuxxTheme(nuxxDarkThemeName), isTrue);
      expect(isNuxxTheme('github-light'), isFalse);
      expect(isNuxxTheme(''), isFalse);
    });
  });
}
