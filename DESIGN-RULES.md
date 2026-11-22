# Design rules (from Kiara) — every agent must follow these

These come straight from the owner's feedback on the first live version. Breaking them is a bug.

## Never invent decorative art
- **No generated ornaments**: no lace, doilies, doves, wax seals, paperclips, tape, ornaments, borders-with-pattern, monogram badges, "B·C" marks, sparkle/flourish SVGs.
- If a design needs artwork, **leave an empty, plain placeholder and add the request to `ASSETS-NEEDED.md`** (file type + where it goes). The owner will supply the SVG / transparent PNG / photo (from Canva, Pinterest, etc.).
- Photos are fine only when they are real photos from `assets/` (Morais photos, the couple's photos, inspo).

## No gradients
- Flat colors only. No `linear-gradient` / `radial-gradient` backgrounds, no glow, no vignette. Photos may get a **flat** dark overlay (single rgba color) so text reads.
- No paper-grain / texture overlays.

## Shape and motion
- **Corners are nearly square**: `border-radius` 2–4px for cards, inputs and buttons. No pills, no capsule tags, no circles except tiny status dots and real photo avatars.
- **No hover movement**: nothing lifts, scales, translates or bounces on hover. Hover = a color/underline change only. No press-scale.
- No top-border accents on cards. No decorative top band/strip above the header (header is one flat color).
- Animation is allowed for state changes (zoom, drag, glide of tables), but **not** on adding rows/items, and never a full-page reload flash when something updates — update in place.

## No initials
- No initials circles/avatars anywhere (guest list, team, graph, popups). Show names. If a person has a profile picture, show the photo; otherwise show nothing. Profile pictures are optional and uploaded by the user.

## Color
- Her palette is **burgundy/wine, pink and green** (+ cream). Use less gold and less green than v1. Cards for bridesmaids are fully filled with their group color (pink / burgundy / green); don't also repeat the color elsewhere on the same card.
- "Needs address" / warnings use burgundy, not amber.

## Type and copy
- A new font pair (the old one was disliked): display = Cormorant Garamond (high-contrast serif, like the Pinterest pin), UI/body = Inter. Script only for the 'are getting married' line.
- Smaller text overall. Fewer words. No descriptions where a label will do.

## Layout
- Pages fit one screen on desktop where possible (no page scroll); lists scroll inside themselves.
- Cards in a grid are the **same size** (no masonry, no ragged heights).
- Footer on every page is identical: History · Start fresh.
- Dropdowns: styled consistently, aligned with their column/field, never floating elsewhere.

## Toasts
- Plain rectangle, flat color, text + Undo. No seal/icon art (owner will supply a toast style to copy).

## Accessibility is a soft request (Kiara, Nov 22 2026)
- Her friends are able-bodied with good vision. Do NOT add harsh high-contrast colours, heavy chips/tiles or opaque surfaces just to hit a contrast ratio. Aim for WCAG AA where it costs nothing visually (soft target; ~3:1 for muted text is fine). Keep the cheap basics: visible focus ring, Esc closes popovers, labels on controls, no keyboard traps. The soft, airy Vow + Betel look wins.
- The help button is a glass circle (translucent cream, blur, hairline), never a solid green square.

## Direction update (Nov 22 2026)
- No more accessibility passes. Prefer dynamic, less flat looks: soft translucent glass, white-glass masthead, depth from blur/shadow/photo layers (still NO gradients).
- Motion: tiny, simple, quaint transitions only (120-220ms ease-out: fade + 4px rise on appear, sliding tab underline, soft popover fade/scale-in). Never overdone. No hover movement. State changes only.

## Round 10 (Kiara)
- Dropdown menus and pill chips may be bubbly (up to 12-14px). Everything else keeps the 2-6px rule. Prefer a clean line icon (title + aria-label) over a word on small utility buttons. Content is ~8-10% smaller in a 1120px column so the blurred photos show. Loaders are the heart (`heartLoaderHTML`).
