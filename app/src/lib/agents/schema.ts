import { z } from "zod";

export const VIBE_ALLOWLIST = [
  "minimal",
  "playful",
  "luxe",
  "bold",
  "warm",
  "cool",
  "rustic",
  "futuristic",
  "elegant",
  "friendly",
  "edgy",
  "calm",
  "energetic",
  "nostalgic",
  "premium",
] as const;

export const DEADLINE_PRESETS = {
  demo: { deadlineSecs: 120, pickWindowSecs: 120 },
  "1h": { deadlineSecs: 60 * 60, pickWindowSecs: 60 * 60 },
  "24h": { deadlineSecs: 24 * 60 * 60, pickWindowSecs: 24 * 60 * 60 },
} as const;

export const FONT_ALLOWLIST = [
  "Inter",
  "Roboto",
  "Playfair Display",
  "Montserrat",
  "Poppins",
  "Space Grotesk",
  "DM Sans",
  "Cormorant Garamond",
  "Bebas Neue",
  "Fraunces",
  "Work Sans",
  "IBM Plex Mono",
  "Archivo Black",
  "Libre Baskerville",
  "Josefin Sans",
  "Spectral",
  "Sora",
  "Oswald",
  "EB Garamond",
  "Syne",
] as const;

export const BriefSchema = z.object({
  businessName: z.string().min(1).max(60),
  whatItDoes: z.string().min(1).max(300),
  audience: z.string().min(1).max(200),
  vibe: z.array(z.enum(VIBE_ALLOWLIST)).min(1).max(5),
  avoid: z.string().max(200).optional(),
  prizeTusdc: z.number().int().min(1).max(1000),
  deadlinePreset: z.enum(["demo", "1h", "24h"]),
});

export type Brief = z.infer<typeof BriefSchema>;

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "must be a 6-digit hex color");

export const BrandKitSchema = z.object({
  names: z.array(z.string().min(1).max(40)).length(3),
  tagline: z.string().min(1).max(80),
  palette: z
    .array(
      z.object({
        name: z.string().min(1).max(24),
        hex: hexColor,
      }),
    )
    .length(5),
  fonts: z.object({
    heading: z.enum(FONT_ALLOWLIST),
    body: z.enum(FONT_ALLOWLIST),
  }),
  logoSvg: z
    .string()
    .min(1)
    .refine((svg) => Buffer.byteLength(svg, "utf8") <= 20_000, {
      message: "logoSvg must be at most 20 KB",
    }),
  moodboard: z.array(z.string().min(1).max(120)).length(4),
  rationale: z.string().refine(
    (text) => text.trim().split(/\s+/).filter(Boolean).length <= 120,
    { message: "rationale must be at most 120 words" },
  ),
});

export type BrandKit = z.infer<typeof BrandKitSchema>;
