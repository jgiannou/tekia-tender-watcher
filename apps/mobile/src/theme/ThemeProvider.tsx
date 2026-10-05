import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ColorSchemeName } from "react-native";
import { Appearance, useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { saasApi, type ThemePreference } from "@/lib/api";
import { arcDark, arcLight, type ArcColors } from "./colors";

const STORAGE_KEY = "arc-tenders-theme";

type ThemeContextValue = {
  theme: ThemePreference;
  resolved: "DARK" | "LIGHT";
  colors: ArcColors;
  setTheme: (theme: ThemePreference) => Promise<void>;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const resolveTheme = (
  theme: ThemePreference,
  system: ColorSchemeName,
): "DARK" | "LIGHT" => {
  if (theme === "SYSTEM") return system === "light" ? "LIGHT" : "DARK";
  return theme;
};

export const ThemeProvider = ({
  children,
  serverTheme,
}: {
  children: ReactNode;
  serverTheme?: ThemePreference | null;
}) => {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemePreference>("DARK");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      if (serverTheme) {
        if (!cancelled) {
          setThemeState(serverTheme);
          await SecureStore.setItemAsync(STORAGE_KEY, serverTheme);
        }
      } else {
        const local = await SecureStore.getItemAsync(STORAGE_KEY);
        if (
          !cancelled &&
          (local === "DARK" || local === "LIGHT" || local === "SYSTEM")
        ) {
          setThemeState(local);
        }
      }
      if (!cancelled) setHydrated(true);
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [serverTheme]);

  const setTheme = useCallback(async (next: ThemePreference) => {
    setThemeState(next);
    await SecureStore.setItemAsync(STORAGE_KEY, next);
    try {
      await saasApi.setTheme(next);
    } catch {
      // Local preference still applies offline / before org session.
    }
  }, []);

  const resolved = resolveTheme(theme, systemScheme);
  const colors = resolved === "LIGHT" ? arcLight : arcDark;

  const value = useMemo(
    () => ({ theme, resolved, colors, setTheme, hydrated }),
    [theme, resolved, colors, setTheme, hydrated],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};

export const useSystemAppearanceListener = () => {
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => undefined);
    return () => sub.remove();
  }, []);
};
