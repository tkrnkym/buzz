import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const STORAGE_KEY = "nuxx-theme";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function getInitialTheme(): Theme {
  // The dev-only preview override wins, so a screenshot spec can pin a theme
  // without touching the reader's stored choice.
  if (import.meta.env.DEV) {
    const previewTheme = new URLSearchParams(window.location.search).get(
      "previewTheme",
    );
    if (previewTheme === "light" || previewTheme === "dark") {
      return previewTheme;
    }
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // A blocked localStorage is not a reason to fail to render.
  }
  return "system";
}

function applyClass(isDark: boolean) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(isDark ? "dark" : "light");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [isDark, setIsDark] = useState<boolean>(() => {
    const initialTheme = getInitialTheme();
    const dark =
      initialTheme === "system" ? getSystemDark() : initialTheme === "dark";
    applyClass(dark);
    return dark;
  });

  useEffect(() => {
    const dark = theme === "system" ? getSystemDark() : theme === "dark";
    applyClass(dark);
    setIsDark(dark);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      applyClass(e.matches);
      setIsDark(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    // Persisted, because a theme choice that vanishes on reload is worse than
    // not offering the setting at all.
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Same as above: the choice still applies to this page load.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, isDark, setTheme }}>
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
