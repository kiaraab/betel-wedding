# Betel design portfolio

Taste guide for future UI work on the wedding site. Everything below is read off the images in `assets/refs/` and the two rule files (`DESIGN-RULES.md`, `ASSETS-NEEDED.md`). Hex values were sampled with PIL (median-cut quantisation plus 9x9 pixel averages at chosen points); shares are rough estimates, not exact. Where a ref is a screenshot of someone else's design, it shows her taste, not a spec to copy.

Visual one-pager: `design-portfolio.html`.

## 1. Mood and read of her taste

**Mood in 5 words: moody, romantic, antique, satin-soft, garden.**

She likes deep wine, olive and blush together on a warm cream ground (`owner-ref-1.webp`: a collage of satin gowns in olive, burgundy, pink, magenta, chartreuse, plum on a peach-cream background). Her website refs are dark-forest or aged-paper pages with a high-contrast serif and a swashy italic script, and soft heirloom details such as lace ovals and scalloped lace dividers (`owner-ref-3.webp`, `website ref.jpg`, `lace.jpg`, `owner-ref-2.webp`). She wants the site to feel like a romantic keepsake you move through, but she has been explicit that the decoration must be real supplied art, nothing we draw, and that the UI itself stays flat, square-cornered and quiet (`DESIGN-RULES.md`).

## 2. Palette

Sampled values. "Share" is the approximate weight inside the Betel refs (owner-ref-1 and the website refs), not the final UI.

| # | Name | Hex | Role | Share | Source |
|---|------|-----|------|-------|--------|
| 1 | Peach cream | `#efdec9` | background (warm canvas) | ~35% of ref-1 | `owner-ref-1.webp` bg |
| 2 | Aged paper | `#e3dacd` | surface (cards, RSVP-style panels) | ~10% | `owner-ref-3.webp` torn paper |
| 3 | Lace white | `#f0ece9` | surface / frame fill | ~5% | `lace.jpg` |
| 4 | Burgundy | `#631530` | primary accent, buttons, headings on light | ~11% (wine family) | `owner-ref-1.webp` dresses |
| 5 | Deep wine | `#310e16` | text ink, darkest wine shade | ~6% | `owner-ref-1.webp` shadows |
| 6 | Berry magenta | `#a5205b` | rare accent only | ~2% | `owner-ref-1.webp` right dress |
| 7 | Blush pink | `#d6acb2` | accent / group colour (pink) | ~3% | `owner-ref-1.webp` pink gowns |
| 8 | Olive | `#585e39` | accent / group colour (green) | ~4.5% | `owner-ref-1.webp`, `owner-ref-4.webp` foliage |
| 9 | Sage-lime | `#b9b77e` | secondary green, tints | ~3% | `owner-ref-1.webp` |
| 10 | Forest night | `#222b1c` | dark background, image overlay base | ~45% of ref-3 | `owner-ref-3.webp` |

Extras seen but not needed as tokens: dusty mauve `#a16a78` (ref-1), Vow button green `#344d3d` and sage-grey `#788579` (`inspo-vow-3d.webp`, `inspo-vow-loading.png`), warm tan `#d8c5a2` (Vow dance floor, `inspo-vow-2d-plan.png`), venue gold/oak `#ddae83` (ballroom floors and chandeliers, `owner-ref-r5-10.webp`, `owner-ref-6.webp`).

### What `styles.css` already uses
The last `:root` blocks win. Current effective tokens: burgundy `--moss-800 #5e1a29` and `--wine #6e1f2e` (matches swatch 4), dusty-rose / pink `--gold-2 #c9a0a6` (swatch 7), green `--leaf #56694b` / `#6f7d4a` (swatch 8), paper `#f6f1ea` and card `#fbf8f3` (near swatches 2/3), ink `#2a1a1d` (swatch 5), Vow green `--vow-green #2f3d33`. Fonts loaded: Cinzel, Cormorant Garamond, Pinyon Script, Inter.

### Gaps
- **Warm peach-cream canvas (`#efdec9`)**: ref-1 is clearly warmer and more peach than our `#f6f1ea`. Use it for large backgrounds if she wants closer to the refs; keep `#f6f1ea` for cards so text contrast stays high.
- **Forest night (`#222b1c`)**: the dark mode of her refs (ref-3, ref-2 pins) has no token; `--vow-green #2f3d33` is lighter and greyer.
- **Berry magenta (`#a5205b`)**: none. Use sparingly (status or a single highlight), never as a surface.
- **Sage-lime tint**: only partly covered by `--moss-300 / --sage-*`.
- The legacy first `:root` block still holds old moss/gold/Fraunces/DM Sans/18px values that later blocks override; do not reintroduce them.

## 3. Typography

What the refs show:
- **Display serif**: high-contrast, thin hairlines, tight tracking, set in capitals for names and section titles ("CLEO & JASPER", "WELCOME TO OUR WEDDING" in `owner-ref-3.webp`; "MADELINE & IAN'S" in `website ref.jpg`, with an italic ampersand). Regular to medium weight, never bold. Italic old-style serif for page headlines (`website ref.jpg`, `owner-ref-2.webp` 6th pin).
- **Script**: swashy italic calligraphy, lowercase, small, used for one connecting phrase ("are getting married", "Cleo and Jasper", "Please let us know if you'll be joining us" in `owner-ref-3.webp`). In `website ref.jpg` script also appears as section headings ("Our Story", "Timeline", "When", "Where") in muted teal and red.
- **Sans**: light, widely tracked, all caps, tiny, for kickers ("CANVA WEDDING INVITATION RSVP", "2027. JULY 15." in `owner-ref-3.webp`; "WEDDING ATELIER", "YOUR WEDDING" in the Vow refs).
- **Body**: small and quiet; in the refs it is tiny serif or small sans with generous line height.

Mapping to our fonts:
| Role | Font | Settings |
|------|------|----------|
| Page titles, names | Cormorant Garamond 500, 600 for small sizes | high contrast is in the font already; `letter-spacing: .01em`; caps only for short titles |
| Caps kickers, nav labels, table headings | Cinzel 400-500 | `font-size: 11-12px; letter-spacing: .14em; text-transform: uppercase` (similar to the Vow kickers) |
| UI, forms, tables, body | Inter 400/500 | 13-15px, `line-height: 1.5`, never below AA contrast |
| One script phrase | Pinyon Script | only 'are getting married' per `DESIGN-RULES.md`; no script section headings (the `website ref.jpg` use is not adopted) |

Cormorant at small sizes is thin; use weight 500+ under 18px or switch to Inter.

## 4. Imagery and motifs

What the refs show (not what we may make):
- **Photography**: soft, natural light, muted and slightly desaturated; couple seen from behind, candid, wide crops with trees/water (`owner-ref-3.webp` hero). Venue shots are bright and airy daylight (`owner-ref-4.webp` courtyard with stone urns and path, `owner-ref-r5-15.png` lawn ceremony) or warm ballroom evenings with gold chandeliers (`owner-ref-6.webp`, `owner-ref-r5-10..12.webp`, `owner-ref-r5-14.png` b/w first dance). A flat dark overlay is how dark-green pages keep text readable.
- **Florals**: dense green garlands with burgundy, red, yellow flowers on long tables (`owner-ref-r5-10/11.webp`); burgundy tablecloths with a tall centrepiece (`owner-ref-r5-12.webp`); pressed single flowers cut out on paper (`website ref.jpg`). The palette of the florals matches the gown colours in ref-1.
- **Lace**: white scalloped oval frame around the couple photo (`owner-ref-3.webp`, `lace.jpg`); scalloped lace strip as a section divider (`website ref.jpg`).
- **Textures and ornaments seen in refs**: torn paper, paperclip, photo strip, dove cut-out, gold oval frame, oil-painting hero, linen texture. This is her inspiration for the mood only.
- **Ornament level**: high on the inspiration pages, low in our UI. Ornament lives in a few supplied images (hero, dividers), not in components.

**We must NOT generate any of it.** Per `DESIGN-RULES.md`: no generated lace, doves, seals, paperclips, tape, ornaments, patterned borders, monogram badges, flourish SVGs, no gradients, no paper-grain or texture overlays, no initials avatars. When art is needed, leave a plain empty slot and add a row to `ASSETS-NEEDED.md` (file type + position) for Kiara to send (SVG or transparent PNG from Canva or Pinterest). `lace.jpg` is a photo of an oval lace on white (not transparent) and is a reference, not a ready asset: the lace oval is still listed as needed in `ASSETS-NEEDED.md`. Only real photos from `assets/` may be used (Morais photos, the couple's photos).

## 5. Layout, spacing and component mood (CSS-ready)

Feel: one calm focus per screen, lots of cream space around small type, centred hero compositions on the inspiration pages, tidy left-aligned working panels in Vow. Density is low to medium; lists scroll inside themselves.

```css
:root {
  --canvas: #f6f1ea;      /* or #efdec9 for hero/background areas */
  --card: #fbf8f3;
  --ink: #2a1a1d;
  --burgundy: #5e1a29;
  --line: #e6ddd2;
  --line-strong: #d9cdc0;
  --radius: 3px;          /* 2-4px only */
  --space: 8px;           /* spacing steps 8 / 12 / 16 / 24 / 40 */
}
.card   { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 20px; box-shadow: none; }
.btn    { border-radius: var(--radius); padding: 8px 16px; font: 500 13px/1 Inter; background: var(--burgundy); color: #fbf8f3; border: 1px solid var(--burgundy); transition: background-color .15s, color .15s; }
.btn:hover { background: #7a2434; }              /* colour only, no transform */
.btn.line  { background: transparent; color: var(--burgundy); }
.btn.line:hover { background: #f3e1e3; }
.input, .select { border: 1px solid #8a7a75; border-radius: var(--radius); background: #fff; padding: 8px 10px; }
:focus-visible { outline: 2px solid #6e1f2e; outline-offset: 2px; }
a:hover, .linklike:hover { text-decoration: underline; }   /* hover = underline or colour */
.kicker { font: 400 11px/1.2 Cinzel, serif; letter-spacing: .14em; text-transform: uppercase; }
```
- Borders: 1px hairlines in warm greys; no top-border accents on cards; no decorative band above the header.
- Shadows: none on cards; at most one soft shadow on floating panels and menus (Vow uses a panel on the 3D scene, `inspo-vow-3d.webp`). Max `0 12px 28px -20px rgba(31,38,26,.35)`, flat single colour, no glow.
- Dropdowns: same border, radius and height as inputs, opening directly under the field, same width, text left-aligned, options separated by hairlines; selected = filled burgundy or sage tint.
- Cards in a grid: identical size, identical padding. Bridesmaid cards fully filled in their group colour (pink / burgundy / green) and the colour not repeated elsewhere on the card.
- Toasts: plain rectangle, flat colour, text + Undo (owner will supply a style).
- Motion: state changes only (zoom, drag, glide); no hover lift or scale; no animation on adding rows.

## 6. Do / Don't

**Do**
- Pair burgundy, blush and olive on warm cream; use forest night for dark hero areas with a flat overlay.
- Use real venue photos, small caps kickers, one script line.
- Keep copy minimal and labels short.
- Show names; show a photo only if one was uploaded.
- Use burgundy for warnings and "needs address".
- Update in place; keep footers identical on every page (History, Start fresh).
- Ask Kiara for any artwork and log it in `ASSETS-NEEDED.md`.

**Don't**
- No gradients, glow, vignette, grain or texture overlays.
- No pill shapes, circles (except tiny status dots and real photo avatars), initials, monogram marks.
- No generated lace, doves, seals, clips, flourishes, or "decorative" SVG.
- No hover lift, scale, bounce.
- No amber warnings, no heavy gold, no extra green.
- No masonry or uneven card heights; no page scroll on desktop where avoidable.
- No bold display type, no script headings.

## 7. Page-by-page

- **Overview**: dark forest or cream hero with the real couple photo or Morais ballroom photo (flat overlay), Cormorant title in caps, Cinzel kicker for the date, the single Pinyon line 'are getting married'. Leave the lace-oval slot empty until Kiara sends it (`ASSETS-NEEDED.md` #1). Below it, equal-size stat cards, one screen, no scroll.
- **Team**: equal-size cards fully filled in pink, burgundy or green; name in Cormorant, role in Inter small; no initials; photo only if uploaded; text colour chosen for AA on each fill (white on burgundy and olive, deep wine on blush).
- **Guests**: compact list/table inside its own scroll area; Inter 13px, hairline row dividers, filters as 3px-radius buttons (not pills); names only; address warnings in burgundy; optional photo column.
- **Agenda**: simple vertical timeline with Cinzel times and Cormorant titles, hairline rules, sparse words; reference the "Timeline" layout in `website ref.jpg` for density only, set in our fonts, not script.
- **Seating**: stays in the Vow structure (see section 8): cream side panel, scene or plan filling the rest, round table chips like "01 · 0/8", names not initials; venue photo as background of each space when higher-resolution photos arrive (`ASSETS-NEEDED.md` #6).
- **Password screen**: forest-night flat background or flat-overlaid Morais photo, centred title in Cormorant caps, one script line, one Inter input (3px radius, AA border), one burgundy button; nothing else. Lace and dove slots stay empty until supplied.
- **History and dialogs**: flat `#fbf8f3` panel, 1px border, 3px radius, one soft shadow, Cinzel kicker + Cormorant title, Inter body; buttons right-aligned, primary burgundy, secondary outline; footer link text only; destructive actions in burgundy, plain confirm text; toasts as plain rectangles with Undo.

## 8. Distance from the Vow structure

What Vow gives us (`inspo-vow-3d.webp`, `inspo-vow-loading.png`, `inspo-vow-2d-plan.png`): a left cream sidebar (~330px of a 1903px screen) with a serif title, caps kicker, tabs (Tables, Guests, Mood), a dark green primary button, a large scene filling the right side with a serif scene title and white labelled chips over tables, a floating tool cluster top-right, a segmented "3D view / Floor plan" switch bottom-centre, a bottom-right "Experience the evening" button, a calm sage-grey loading screen with a serif "V" and "Opening the garden...", and a 2D plan with hairline frame, pale taupe tables and a tan dance floor.

Stay with these decisions already made: the Vow-style layout (sidebar + scene), the 3D/2D switch, flat colour, square-ish corners, no initials.

Blend Betel's mood in through colour and type only:
- Swap Vow's dark green primary `#344d3d` for burgundy `#5e1a29`; keep Vow's green as the secondary/dark neutral (`--vow-green #2f3d33`, close to forest night).
- Sidebar background: warm cream (`#f6f1ea`) instead of Vow's near-white `#f8f7f1`, so the cream-and-wine feel carries.
- Table chips and 2D tables: pale blush/cream fills with burgundy numbers; group colours (pink, burgundy, green) as flat fills.
- Scene title: Cormorant; kickers: Cinzel caps tracked; body: Inter. Same hierarchy as Vow's serif + caps + sans, so we keep its structure.
- Loading screen: keep Vow's flat sage-grey layout; set text in Cormorant. No monogram "V" or "B and C" mark (rule: no monogram badges); use plain text only.
- Dark scenes: use forest night with a flat overlay, which echoes both Vow's night view and her dark-forest refs.
- Romance comes from real photos (Morais, couple) and the supplied lace and floral art when it arrives, never from drawn ornaments. Until then the layout is Vow-clean and the colours carry the mood.
- Distance rule of thumb: layout 100% Vow, palette about 70% Betel, type 100% Betel (Cormorant/Cinzel/Inter), decoration 0% until assets arrive.

## Open questions for Kiara
- Does she want the larger background warmer (`#efdec9`) or keep the current paper?
- Is the berry magenta (`#a5205b`) welcome as an accent?
- Resend the lace oval as transparent PNG/SVG (`lace.jpg` is on a white background).
