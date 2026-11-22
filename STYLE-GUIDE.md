# Style guide

Short and binding. The look is Vow's airy structure in Betel's palette: cream page, one wine accent, pink and green as data colours only. `DESIGN-RULES.md` has the owner's rules; this file covers how the CSS is put together.

## How `styles.css` is built
1. **Tokens.** There is one `:root` block at the top of the file. Never add a second one.
2. **Page and older rules.** These are the historic layers. Edit a rule here only when it is page-specific.
3. **`/* --- design system --- */`.** This is the last layer, and it holds the canonical look of every shared control. It maps existing class names onto the tokens with selector lists.

The last rule wins. That is why shared looks live in the last layer, and a page tweak goes above it with a *more specific* selector.

## Tokens (most used)
| Role | Token | Value |
|---|---|---|
| Text / muted / faint | `--c-ink` / `--c-muted` / `--c-faint` | #2a1a1d / #5e4c4f / #6b5a60 |
| Page / surface / selected well | `--c-canvas` / `--c-surface` / `--c-surface-2` | #f6f1ea / #fbf8f3 / #efe8de |
| Primary (the only one) | `--c-wine`, hover `--c-wine-hover`, tint `--c-wine-tint` | #6e1f2e / #5a1822 / #f3e1e3 |
| Data colours | `--c-pink`, `--c-pink-fill`, `--c-leaf`, `--c-burgundy` | not used for chrome |
| Lines | `--c-line` (hairline), `--c-line-strong`, `--c-field-line` | |
| Status | `--st-todo` grey, `--st-prog` rose, `--st-wait` wine, `--st-done` green | always shape + text |
| Focus | `--focus` (wine), `--focus-on-dark` (white), `--ring` | 2px, 2px offset |
| Shape | `--r` 4px, `--r-chip` 3px | |
| Heights | `--h-sm` 32, `--h-md` 40, `--h-touch` 44 | |
| Shadow | `--sh-1` panels, `--sh-2` floating layers | flat, one colour |
| Spacing | `--s-1`…`--s-6` = 4 8 12 16 24 32 | |
| Type | `--display` Cormorant, `--sans` Inter, `--caps` Cinzel, `--script` Pinyon (one line only) | |

Legacy names such as `--moss-800` and `--gold` still exist because older rules use them. They are aliases, so don't use them in new code.

## Components: which one to use
| Job | Use | Look |
|---|---|---|
| Main action | `.btn.moss` (or `.btn.primary`) | wine fill, white text. One per view. |
| Other action | `.btn.line`, or plain `.btn` | hairline outline, ink text, wine on hover |
| Low-key action | `.btn.ghost`, `.linkbtn`, `.linklike` | wine/ink text, underline on hover |
| Icon only | `.icon-btn` + `aria-label` | 32px square (44 on touch) |
| Size | add `.sm` | 32px (default is 40) |
| Pick a view | `.viewseg` (+ `.view-pill` over the 3D) | hairline box, selected tile is a wine fill |
| Switch a panel | `role="tablist"` with `.vs-tabs` / `.ref-tabs` | muted to ink, 2px wine underline |
| Filter toggle | `.chip` (`.on`) | 3px, hairline, wine when on |
| Pick a value | `select.select[data-bub]` (button + bubbly menu, `bubbleSelects()` in `js/util.js`; icons via `GLYPHS`) | 12px glass menu, 14px dark chevron, check on the picked row |
| Show / hide columns | `.gcols` + `.gc-menu` | bubbly menu of toggles, saved in `state.guestCols` |
| Menu / popover | `.gf-menu`, `.pop`, `.tc-menu` … | flat surface on cream, glass only over a photo or the 3D |
| Confirm | `confirmDialog()` (`.cd`) | only for things that can't be undone |
| Feedback | `toast()` | solid ink rectangle with Undo |

## The rules
- **Corners:** 4px, chips 3px. No pills. Exception (Kiara, round 10): dropdown menus (`.gf-menu`, `.gc-menu`, `.bs-menu`) and pill chips/closed selects (`.bs-btn`, `.gf-btn`) may go up to 12-14px; set it with `--r`, never a new radius rule. Circles only for tiny status dots, real photos and the floating help button (`.guide-q`, glass).
- **Hover** changes colour or underline only. Nothing moves, lifts or grows a shadow.
- **Glass** only for layers that float over a photo, the 3D or the page (seating toolbar, view pill, popovers, dialogs, the Team page over its photo, the help button). Cards and menus on plain cream are flat.
- **No gradients, no generated art, no initials.**
- **Contrast:** aim for AA, but treat it as a soft target. Keep text comfortably readable. Muted or secondary text around 3:1 is fine. Never darken, thicken or add tiles just to hit a ratio; the soft, airy look wins.
- **Cheap basics stay:** a visible focus ring everywhere (set by the design-system layer), Esc closes popovers, every control has a label, and there are no keyboard traps. Tabs use roving tabindex with arrow keys and Home/End (`initTablists()` in `js/util.js`). The guest filter is a listbox with arrows, Home/End, type-ahead and Esc.

## Adding a new component without adding a layer
1. Build it from tokens only (`var(--c-*)`, `--r`, `--h-*`, `--sh-*`, `--s-*`). Don't use raw hex values.
2. If it does an existing job (see the table), reuse that class. Otherwise add its selector to the matching rule in the design-system layer, or add one new rule there.
3. Page-only variations go above the layer as a more specific selector (for example `body[data-route="team"] .x`). Never repeat a whole component further down.
4. Don't use `!important`. The only exceptions are the corner and focus-ring rules in the layer.
5. On a dark surface, set `--ring: var(--focus-on-dark)` on its container instead of writing a new outline rule.
6. Before deleting a rule, grep `js/*.js` and `index.html` for its class.
