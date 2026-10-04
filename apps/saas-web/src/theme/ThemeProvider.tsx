import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { saasApi, type ThemePreference } from "@/lib/api";

const STORAGE_KEY = "arc-tenders-theme";

type ThemeContextValue = {
  theme: ThemePreference;
  resolved: "DARK" | "LIGHT";
  setTheme: (theme: ThemePreference) => Promise<void>;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readLocalTheme = (): ThemePreference => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "DARK" || raw === "LIGHT" || raw === "SYSTEM") return raw;
  return "DARK";
};

const resolveTheme = (theme: ThemePreference): "DARK" | "LIGHT" => {
  if (theme === "SYSTEM") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "LIGHT"
      : "DARK";
  }
  return theme;
};

const applyDomTheme = (theme: ThemePreference) => {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(resolved === "DARK" ? "dark" : "light");
  root.dataset.theme = resolved.toLowerCase();
};

export const ThemeProvider = ({
  children,
  serverTheme,
}: {
  children: ReactNode;
  serverTheme?: ThemePreference | null;
}) => {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "DARK";
    return serverTheme ?? readLocalTheme();
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (serverTheme) {
      setThemeState(serverTheme);
      localStorage.setItem(STORAGE_KEY, serverTheme);
      applyDomTheme(serverTheme);
    } else {
      const local = readLocalTheme();
      setThemeState(local);
      applyDomTheme(local);
    }
    setHydrated(true);
  }, [serverTheme]);

  useEffect(() => {
    if (!hydrated) return;
    applyDomTheme(theme);
    if (theme !== "SYSTEM") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyDomTheme("SYSTEM");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, hydrated]);

  const setTheme = useCallback(async (next: ThemePreference) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyDomTheme(next);
    try {
      await saasApi.setTheme(next);
    } catch {
      // local preference remains usable offline
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolved: resolveTheme(theme),
      setTheme,
      hydrated,
    }),
    [theme, setTheme, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
