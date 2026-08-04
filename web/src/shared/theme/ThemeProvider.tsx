import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { createThemeVars } from "./adaptive-theme";
import {
  DEFAULT_ACCENT,
  accentVars,
  isNuxxTheme,
  resolveEffectiveAccent,
} from "./accent";
import {
  type SyntaxThemeName,
  extractThemeInfo,
  getThemePair,
  isValidThemeName,
  loadThemeData,
  resolveSystemTheme,
} from "./theme-loader";
import {
  ACCENT_STORAGE_KEY,
  FOLLOW_SYSTEM_KEY,
  THEME_CACHE_KEY,
  THEME_STORAGE_KEY,
  type ThemeMode,
  applyMode,
  modeFor,
  previewThemeFrom,
  readStoredFollowSystem,
  readStoredTheme,
} from "./theme-mode";

/**
 * The app's palette is computed, not written down.
 *
 * `shared/styles/globals.css` carries one hardcoded palette, and it is only the
 * pre-hydration fallback — what the reader actually sees is derived here from
 * the selected syntax theme's colors and written onto `:root` as inline custom
 * properties. Every `hsl(var(--background))` in the app resolves against these.
 *
 * Ported from the desktop client (`desktop/src/shared/theme/ThemeProvider.tsx`
 * at commit 02749b3^). Two things are deliberately left behind: the macOS
 * vibrancy handshake (`data-buzz-translucent` sequenced against an
 * `NSVisualEffectView`) has no browser counterpart, and the video-review accent
 * vars belong to a surface the web client does not have.
 */

type ThemeContextValue = {
  /** The theme actually applied, after follow-system resolution. */
  themeName: SyntaxThemeName;
  /** The theme the reader picked, which may be the other half of a pair. */
  selectedTheme: SyntaxThemeName;
  isDark: boolean;
  isLoading: boolean;
  /** The three-way control: Light / Dark / follow the OS. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  setThemeName: (name: SyntaxThemeName) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
  /** False for themes with no light/dark counterpart, so the UI can say so. */
  hasPair: boolean;
  /** True while a colored accent has no effect, because Nuxx pins it neutral. */
  accentPinned: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** localStorage can be blocked; a missing preference is not a reason to fail. */
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The choice still applies to this page load.
  }
}

function setVars(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

/**
 * Mark the branded themes so the gradient stylesheet can find them.
 *
 * The concrete variant goes on the root as well as the generic marker, because
 * the gradient rules match `.dark` for which layer is visible and the two have
 * to be invalidated together.
 */
function applyNuxxSidebar(themeName: string) {
  const root = document.documentElement;
  if (isNuxxTheme(themeName)) {
    root.setAttribute("data-nuxx-sidebar", "");
    root.setAttribute("data-nuxx-theme", themeName);
  } else {
    root.removeAttribute("data-nuxx-sidebar");
    root.removeAttribute("data-nuxx-theme");
  }
}

function applyDarkClass(isDark: boolean) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(isDark ? "dark" : "light");
}

type CachedTheme = {
  themeName: SyntaxThemeName;
  vars: Record<string, string>;
  isDark: boolean;
};

/**
 * Paint the last known palette synchronously, before the first render.
 *
 * The theme JSON is a dynamic import, so the derived vars cannot exist on the
 * first frame. Without this the app paints the fallback palette and then
 * repaints — a full-page color flash on every load, which is worse than the
 * wrong palette for one frame because it happens every time.
 */
function applyCachedVars(accent: string): SyntaxThemeName | null {
  const cached = readStorage(THEME_CACHE_KEY);
  if (!cached) return null;
  try {
    const { themeName, vars, isDark } = JSON.parse(cached) as CachedTheme;
    if (!isValidThemeName(themeName)) return null;
    setVars(vars);
    applyDarkClass(isDark);
    applyNuxxSidebar(themeName);
    setVars(
      accentVars(
        resolveEffectiveAccent(themeName, accent),
        vars["--foreground"] ?? "",
        vars["--background"] ?? "",
      ),
    );
    return themeName;
  } catch {
    // A corrupt cache costs one flash, not a blank page.
    return null;
  }
}

/** The latest theme load is the only one allowed to write document styles. */
let themeApplyRequest = 0;

/** Load a theme, derive its vars, and put them on the root. */
async function applyTheme(
  name: SyntaxThemeName,
  accent: string,
): Promise<{ isDark: boolean } | null> {
  const requestToken = ++themeApplyRequest;
  const themeData = await loadThemeData(name);
  // A newer switch started while this JSON was in flight; it owns the document.
  if (requestToken !== themeApplyRequest) return null;

  const info = extractThemeInfo(name, themeData);
  const { isDark, vars } = createThemeVars(info.bg, info.fg, info.comment, {
    added: info.added,
    deleted: info.deleted,
    modified: info.modified,
  });

  setVars(vars);
  applyDarkClass(isDark);
  applyNuxxSidebar(name);
  // In the same batch as the theme vars, so the browser paints the new theme
  // and its accent together. Deferring this to a later microtask let the
  // previous accent show on the new palette for a frame.
  setVars(
    accentVars(
      resolveEffectiveAccent(name, accent),
      vars["--foreground"],
      vars["--background"],
    ),
  );

  writeStorage(
    THEME_CACHE_KEY,
    JSON.stringify({ themeName: name, vars, isDark }),
  );

  return { isDark };
}

export function ThemeProvider({
  children,
  defaultTheme = "nuxx",
}: {
  children: ReactNode;
  defaultTheme?: SyntaxThemeName;
}) {
  const [accentColor, setAccentColorState] = useState<string>(
    () => readStorage(ACCENT_STORAGE_KEY) ?? DEFAULT_ACCENT,
  );
  const [selectedTheme, setSelectedTheme] = useState<SyntaxThemeName>(() => {
    // The dev-only preview override wins, so a screenshot spec can pin a theme
    // without touching the reader's stored choice.
    const preview = import.meta.env.DEV
      ? previewThemeFrom(window.location.search)
      : null;
    applyCachedVars(readStorage(ACCENT_STORAGE_KEY) ?? DEFAULT_ACCENT);
    return (
      preview ?? readStoredTheme(readStorage(THEME_STORAGE_KEY), defaultTheme)
    );
  });
  const [followSystem, setFollowSystemState] = useState<boolean>(() =>
    readStoredFollowSystem(
      readStorage(FOLLOW_SYSTEM_KEY),
      readStorage(THEME_STORAGE_KEY),
    ),
  );
  const [systemIsDark, setSystemIsDark] = useState<boolean>(getSystemDark);
  const [isDark, setIsDark] = useState<boolean>(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [isLoading, setIsLoading] = useState(true);

  const themeName = followSystem
    ? resolveSystemTheme(selectedTheme, systemIsDark)
    : selectedTheme;

  useEffect(() => {
    setIsLoading(true);
    let current = true;
    applyTheme(themeName, accentColor).then((result) => {
      if (!current || !result) return;
      setIsDark(result.isDark);
      setIsLoading(false);
    });
    return () => {
      current = false;
    };
  }, [themeName, accentColor]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) =>
      setSystemIsDark(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setThemeName = useCallback((name: SyntaxThemeName) => {
    setSelectedTheme(name);
    setFollowSystemState(false);
    writeStorage(THEME_STORAGE_KEY, name);
    writeStorage(FOLLOW_SYSTEM_KEY, "false");
  }, []);

  const setMode = useCallback(
    (mode: ThemeMode) => {
      const next = applyMode(selectedTheme, mode);
      setSelectedTheme(next.theme);
      setFollowSystemState(next.followSystem);
      writeStorage(THEME_STORAGE_KEY, next.theme);
      writeStorage(FOLLOW_SYSTEM_KEY, String(next.followSystem));
    },
    [selectedTheme],
  );

  const setAccentColor = useCallback((color: string) => {
    setAccentColorState(color);
    writeStorage(ACCENT_STORAGE_KEY, color);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        themeName,
        selectedTheme,
        isDark,
        isLoading,
        mode: modeFor(followSystem, isDark),
        setMode,
        setThemeName,
        accentColor,
        setAccentColor,
        hasPair: getThemePair(selectedTheme) !== null,
        accentPinned: isNuxxTheme(themeName),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
