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
