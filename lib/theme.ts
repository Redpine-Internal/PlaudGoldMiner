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
  { name: "Papel branco", hex: "#FFFFFF" },
];

export const ACCENTS: { name: string; hex: string }[] = [
  { name: "Azul-céu funcional", hex: "#A6D7F0" },
];

export const AUX_PRESETS: Record<string, AuxPreset> = {
  corporativa: {
    label: "Corporativa editorial",
    vars: { success: "#2F6F4E", warning: "#8B5A28", error: "#963E35", promo: "#5F401F", active: "#9C6E42", inactive: "#746F69" },
  },
};

export function applyBg(hex: string) {
  document.documentElement.style.setProperty("--app-canvas", hex);
  document.documentElement.style.setProperty("--background", hex);
  document.documentElement.style.setProperty("--color-background", hex);
}

export function applyAccent(hex: string) {
  const r = document.documentElement.style;
  const set = (k: string, v: string) => r.setProperty(k, v);
  set("--sky", hex);
  set("--color-primary", hex);
  set("--color-accent", hex);
  set("--buttonPrimaryBackground", hex);
  set("--buttonPrimaryBackgroundHover", "#8BC8E7");
  set("--buttonPrimaryBackgroundPressed", "#75BADF");
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
    const b = localStorage.getItem(THEME_KEY_BG);
    applyAccent(ACCENTS.some((item) => item.hex === a) ? a! : ACCENTS[0].hex);
    applyAux(x && AUX_PRESETS[x] ? x : "corporativa");
    applyBg(BGS.some((item) => item.hex === b) ? b! : BGS[0].hex);
  } catch {
    /* localStorage unavailable */
  }
}
