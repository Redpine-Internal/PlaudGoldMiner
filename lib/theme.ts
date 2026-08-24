export const THEME_KEY_ACCENT = "andresa-theme-accent";
export const THEME_KEY_AUX = "andresa-theme-aux";
export const THEME_KEY_BG = "andresa-theme-bg";

export interface AuxVars {
  success: string;
  warning: string;
  error: string;
  promo: string;
  active: string;
  inactive: string;
}

export interface AuxPreset {
  label: string;
  vars: AuxVars | null;
}

export const BGS: { name: string; hex: string }[] = [
  { name: "Cinza", hex: "#ECECEC" },
  { name: "Creme", hex: "#F0EDE4" },
  { name: "Areia", hex: "#E9E4D8" },
  { name: "Cinza escuro", hex: "#E2E2E2" },
];

export const ACCENTS: { name: string; hex: string }[] = [
  { name: "Preto", hex: "#000000" },
  { name: "Azul", hex: "#0066FF" },
  { name: "Lilás", hex: "#B86BE8" },
  { name: "Terracota", hex: "#D97757" },
  { name: "Laranja", hex: "#C2410C" },
  { name: "Âmbar", hex: "#B45309" },
  { name: "Verde", hex: "#1F9E64" },
  { name: "Petróleo", hex: "#3D9FA7" },
];

export const AUX_PRESETS: Record<string, AuxPreset> = {
  mistica: { label: "Padrão", vars: null },
  quente: {
    label: "Quente",
    vars: { success: "#7D9B76", warning: "#D4A03C", error: "#C25E4C", promo: "#C77D4F", active: "#A9825A", inactive: "#A79E93" },
  },
  vivas: {
    label: "Vivas",
    vars: { success: "#1F9E64", warning: "#E0A526", error: "#DC4437", promo: "#A855F7", active: "#0FA3B1", inactive: "#8A94A6" },
  },
  pastel: {
    label: "Pastel",
    vars: { success: "#8FC7BD", warning: "#DBBE7F", error: "#E89890", promo: "#CBA3E8", active: "#93C5DD", inactive: "#B8C0CC" },
  },
};

export function applyBg(hex: string) {
  document.documentElement.style.setProperty("--background", hex);
}

export function applyAccent(hex: string) {
  const r = document.documentElement.style;
  const set = (k: string, v: string) => r.setProperty(k, v);
  set("--brand", hex);
  set("--brandHigh", hex);
  set("--buttonPrimaryBackground", hex);
  set("--buttonPrimaryBackgroundHover", "color-mix(in srgb, " + hex + " 85%, " + (hex === "#000000" ? "white" : "black") + ")");
  set("--buttonPrimaryBackgroundPressed", "color-mix(in srgb, " + hex + " 70%, black)");
  set("--textLink", hex);
  set("--textActivated", hex);
  set("--controlActivated", hex);
  set("--borderSelected", hex);
  set("--textButtonSecondary", hex);
  set("--textButtonSecondaryPressed", hex);
}

export function applyAux(name: string) {
  const r = document.documentElement.style;
  const p = AUX_PRESETS[name];
  (["success", "warning", "error", "promo", "active", "inactive"] as const).forEach((k) => {
    if (p && p.vars) r.setProperty("--accent-" + k, p.vars[k]);
    else r.removeProperty("--accent-" + k);
  });
}

export function restoreTheme() {
  try {
    const a = localStorage.getItem(THEME_KEY_ACCENT);
    const x = localStorage.getItem(THEME_KEY_AUX);
    if (a) applyAccent(a);
    if (x && AUX_PRESETS[x]) applyAux(x);
    const b = localStorage.getItem(THEME_KEY_BG);
    if (b) applyBg(b);
  } catch {
    /* localStorage unavailable */
  }
}
