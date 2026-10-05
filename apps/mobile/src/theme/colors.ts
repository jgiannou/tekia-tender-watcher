export const arcDark = {
  bg: "#0a0a0a",
  bgElevated: "#141414",
  bgMuted: "#1a1a1a",
  border: "#2a2a2a",
  text: "#f5f5f5",
  textMuted: "#a3a3a3",
  primary: "#00f3ff",
  primaryFg: "#0a0a0a",
  danger: "#f87171",
  success: "#34d399",
  warning: "#fbbf24",
} as const;

export const arcLight = {
  bg: "#f8fafb",
  bgElevated: "#ffffff",
  bgMuted: "#eef2f3",
  border: "#d7e0e3",
  text: "#0f172a",
  textMuted: "#64748b",
  primary: "#008b96",
  primaryFg: "#ffffff",
  danger: "#dc2626",
  success: "#059669",
  warning: "#d97706",
} as const;

export type ArcColors = {
  bg: string;
  bgElevated: string;
  bgMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryFg: string;
  danger: string;
  success: string;
  warning: string;
};
