import { FONT_ALLOWLIST } from "./agents/schema";

/** next/font/google is broken under this project's Next 16 + Turbopack setup
 * (confirmed during task 0.7 — hard build failure). Loading the allowlist as
 * a plain stylesheet link sidesteps that entirely, and avoids 1990s-letting-
 * agents-pick-arbitrary-fonts: only these 20 families are ever requested. */
export function googleFontsHref(): string {
  const families = FONT_ALLOWLIST.map(
    (name) => `family=${encodeURIComponent(name)}:wght@400;500;600;700`,
  ).join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
