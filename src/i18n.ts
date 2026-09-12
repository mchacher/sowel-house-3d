/**
 * Two languages, one file.
 *
 * The visitor's language is the product's: the Sowel interface keeps its choice in
 * `localStorage.sowel_language`, and this app shares the origin, so the same key
 * is the same preference. Failing that, the browser's. A toggle in the HUD writes
 * the same key, so switching here switches the interface too.
 *
 * Room and level names come from the plan in both languages; what is here is the
 * app's own words. The derivation's problem messages stay in French: they are the
 * operator's diagnostics, not the visitor's.
 */

export type Lang = "fr" | "en";

const KEY = "sowel_language";

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "fr" || stored === "en") return stored;
  } catch {
    /* no storage: the browser decides */
  }
  const browser = typeof navigator === "undefined" ? "fr" : navigator.language;
  return browser.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function rememberLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* a preference that cannot be stored still holds for this page */
  }
}

const STRINGS = {
  fr: {
    noWebgl:
      "Votre navigateur n'affiche pas la 3D (WebGL indisponible) — la maison est là, sous les chiffres.",
    noSession: "Pas de session — revenez par la page d'accueil.",
    unreachable: "Sowel ne répond pas.",
    loading: "Chargement de la maison…",
    reconnecting: "Reconnexion…",
    closed: "Connexion fermée.",
    day: "jour",
    night: "nuit",
    home: "Page d'accueil",
    recentre: "Recadrer",
    outside: "Extérieur",
    anomalies: (n: number) => `${n} anomalies`,
    people: (n: number) => `${n} personne${n === 1 ? "" : "s"} à la maison`,
    lights: (n: number) => `${n} lumière${n === 1 ? "" : "s"} allumée${n === 1 ? "" : "s"}`,
  },
  en: {
    noWebgl:
      "Your browser cannot draw the 3D (no WebGL) — the house is still here, in the figures.",
    noSession: "No session — come back through the welcome page.",
    unreachable: "Sowel is not answering.",
    loading: "Loading the house…",
    reconnecting: "Reconnecting…",
    closed: "Connection closed.",
    day: "day",
    night: "night",
    home: "Welcome page",
    recentre: "Recentre",
    outside: "Outside",
    anomalies: (n: number) => `${n} problems`,
    people: (n: number) => `${n} ${n === 1 ? "person" : "people"} at home`,
    lights: (n: number) => `${n} light${n === 1 ? "" : "s"} on`,
  },
} as const;

export type Strings = (typeof STRINGS)["fr"];

export function strings(lang: Lang): Strings {
  return STRINGS[lang] as Strings;
}

/** A plan name in the visitor's language, French when the plan gives no English. */
export function named(item: { name: string; nameEn?: string }, lang: Lang): string {
  return lang === "en" && item.nameEn ? item.nameEn : item.name;
}
