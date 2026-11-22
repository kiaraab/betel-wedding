# Review round 9 (read-only)

Reviewed on localhost:5173 at commit `1019fc6`, with Kiara's saved plan in localStorage. Viewports were 980×760 and 390×844. Every route was covered: #overview, #team, #guests, #agenda, #seating with all 5 space tabs, 3D and 2D, the footer Edit together popover, the History drawer, the event panel and role edit, and ?gate. I compared against DESIGN-RULES.md, VENUE.md, VENUE-PHOTOS.md, the Vow refs and owner-ref-*. I edited no files and cleared no storage. Already-known gaps are left out: the 320px nav scroll, table drag and the real Tab walk.

## Persona verdicts

- **Betel (bride):** The look is close. The serif space tabs over the photo, the cream Vow sidebar and the glass toolbar all match the Vow inspo well. Three things would feel off to her. The Ceremony tab shows a hedge-and-statue courtyard, not her pergola. Her groom is listed as "Invited". There are gold blobs on the 3D floor that look like extra tables. The green header with the wine footer reads more Christmas than burgundy/pink/cream.
- **Carter (groom):** He gets quick answers on Overview, but some are wrong. It says "12/12 seated" while every table shows 0/8. The Team counts mix people and roles. The guest filter has 30 options. The dot on the details button means "no address" but nothing says so.
- **Planner:** The ballroom shell is right: bay on the long wall, 5 arched doors, two double doors plus corner doors, balcony keep-out. The current reception layout does not follow VENUE-PHOTOS §2. The dance floor is 16×18, the cake is at the far wall, there is no bar or DJ, and the room is lopsided. The ceremony is in the wrong place. The agenda has no walking buffer and puts cake cutting late.
- **UX/A11y:** Contrast passes everywhere except the Plan file links. Key information is hidden in `title` tooltips (clearance conflicts, team dots). The floating help button covers content. On phone, the Floor plan toggle is covered and can't be tapped.
- **Dev:** One real data-integrity bug (dangling `tableId`). One shipped bug from a literal control character (?gate). Old saved spaces never get the round-8 seeds. Sync is last-writer-wins per top-level part. History is per-device only.

---

## MUST-FIX before sharing with Betel

1. **Dangling seat assignments make every "seated" number wrong.** 10 guests (Eden…Monica, test, QAtest) still have `tableId: "t9denhkx"`, a table that no longer exists. The screens contradict each other:
   - They say "12/12 seated" (Overview), "12 of 12 seated" (Seating header), "0 unseated" (sidebar and 3D chip), "0 guests still need a seat." (Seat guests tab) and "Still to seat 0" (guest filter).
   - Meanwhile every table reads 0/8 and Eden's details show Table "—".
   - Counts use `g.tableId` truthiness at `app.js:158`, `app.js:462-463`, `seating.js:1336` and `seating.js:1359`.
   - **Fix:** add a `healSeats()` in `store.js`, run from `load()`, `adopt()` and `mergeRemote()`. It nulls any `tableId` that is not in `state.tables`, then counts seated as `state.tables.some(t => t.id === g.tableId)`.
   - The likely source is a part-wise merge or a history restore that took `tables` without `guests`. Route every whole-array `tables =` replacement through one helper that clears dangling ids.
   - When the list is empty, the copy should read "Everyone has a seat", not "0 guests still need a seat."
2. **Saved plans never get the round-8 Ceremony and Hangout spot.** `state.spaces` still holds the old seeds:
   - **Ceremony** is "Garden courtyard" 40×60 with hedges, statues, pavers and the entrance at the bottom. VENUE-PHOTOS §1.2 and §3.8 say the ceremony is the pergola lawn.
   - **Hangout spot** (`cocktail`) is "Tasting room" 44×34 with fireplace, bar and lounge. That duplicates the Tasting room tab, so the courtyard bistro layout never shows.
   - Cause: `store.js:58` keeps `data.spaces` as saved, and `seating.js:25` only fills keys that are missing.
   - **Fix:** add a VERSION 4 migration. Back up first. If a space still equals the old seed (by room name and size), replace it with `seedCeremony()` / `seedCocktail()`. Keep party order and any `cRow`. Then push once to Firestore as the owner.
3. **The `?gate` password screen never appears.** `index.html:65` has a literal BACKSPACE byte (0x08) after `gate` in `/[?&]gate␈/`. Probably a `\b` that a tool turned into a real control character. I checked with `grep $'\x08'`: 1 hit, also in `HEAD`. So `?gate` is ignored for anyone who has unlocked once. That includes the live site, since this shipped in `1ff62a4`.
   - **Fix:** use `/[?&]gate(?:[=&#]|$)/`, typed by hand.
4. **Phone: "Experience the evening" covers the Floor plan toggle.** At 390px the Floor plan tab spans x 122–220 and `#evening` spans x 153–358, both at y≈662. `elementFromPoint` at the tab's centre returns `#evening`, so tapping "Floor plan" starts the evening walk.
   - **Fix:** at ≤760px, either put the evening button on its own row above the 3D/Plan toggle, or make it an icon in the glass toolbar.
5. **Test guests are in the plan.** "test" and "QAtest" show up:
   - in the guest list
   - in the plus-one dropdown (Eden's details)
   - as "Bridesmaid" in the filter (9)
   - in the "12/60" count.

   **Fix:** delete them here and in the Firestore copy before Betel's first visit.
6. **The groom's RSVP is "Invited".** Couple rows keep editable RSVP and Side selects. Carter's saved row says Invited, which `ensureAutoGuests()` never corrects. It also skews "RSVP yes 1/12".
   - **Fix:** couple rows show a fixed "Couple" label instead of RSVP and Side, and are left out of the RSVP and needs-action maths.

## SHOULD-FIX

7. **Two editors can silently lose each other's edits** (`store.js:229 mergeRemote`, `sync.js:96 push`). The plan is one Firestore doc, and parts merge only at top level, so all of `guests` is one part. If Betel edits guest A while Carter edits guest B, the dirty tab keeps its own `guests`, then `setDoc` overwrites the other's edit. The clean tab `adopt()`s without a word.
   - **Fix:** merge `guests`, `tables`, `roles` and `agenda` by `id`, using a per-item `updatedAt`. Write with a `rev` field inside `runTransaction` and retry on conflict. At least toast "Carter updated Guests" when a remote merge lands.
8. **A dead listener keeps pushing.** In `sync.js:91`, the `onSnapshot` error handler only sets "Reconnecting…". A Firestore listener that errors is finished, so it never resubscribes. Pushes go on and overwrite with stale data. `push()` failures also retry every 4s forever, even on `permission-denied`.
   - **Fix:** on listener error, unsubscribe and re-run `startLive()` with backoff. Pause `push` while not Live. Stop retrying on permission errors.
9. **"Start over" clears the plan for everyone when live.** It sits in the Edit together popover (`sync.js:242`), right beside Revision history. When live, `reset()` pushes an empty plan to every editor. Undo only fixes the local tab, and only if the toast is caught.
   - **Fix:** when live, say so in the dialog ("This clears the plan for Betel, Carter and Kiara") and require a second step. Better, move Start over out of the sharing popover.
10. **History is per-browser, and just viewing makes versions.** `onSave` runs only for local saves, and `adopt()` / `mergeRemote()` never snapshot. So the partner's edits are not in your history and can't be restored. Also, opening Seating with no edit created a "Now · Seating · Team" version. Render writes state: `seating.js:25 state.spaces[space] ||= …` and `spaces.js:190`'s silent commit that slides rows. When live, that also pushes.
    - **Fix:** snapshot on adopt and tag each version with `who`. Make renders pure; seed spaces at load.
11. **A browser `window.prompt` asks for the email** (`sync.js:145`). It fires whenever the sign-in link is opened on another device, which is common (request on the laptop, open on the phone). It breaks the "no browser popups" decision.
    - **Fix:** use the same glass dialog as `confirmDialog`, with an email field.
12. **Ceremony Suggest overwrites the headcount, and two spaces share one seat field.**
    - `spaces.js:202` sets `state.guestTarget = n` from the ceremony chair count. Adding spare chairs changes the Overview "/60" and the next reception Suggest.
    - Ceremony and Indoor both write `g.cRow`, so seating the rain plan wipes the outdoor seating.
    - **Fix:** keep a chair count per space, and key `cRow` by space.
13. **Clearance conflicts are hidden in a tooltip.** `#pmClear` is a non-focusable `<span role=status>` whose `title` holds "1 and 3: 2.0 ft between chairs…". Touch and keyboard users never see the details. It also says "3 conflicts" while 5 tables have dashed rings, which reads as a mismatch.
    - **Fix:** make it a button that opens a short list, e.g. "Tables 1 & 3 · 2 ft apart (need 3.5)", each item selecting the pair, with a "Nudge apart" action.
14. **The current reception layout does not follow VENUE-PHOTOS §2.** Saved `room.areas` and `tables` are below:

    | Item | Now | VENUE-PHOTOS §2 |
    |---|---|---|
    | Dance floor | 16×18 at x17 y26 | 20×20 recommended; 16×18 is the minimum |
    | Cake | 4×4 at x35 y5, against arched door #4 at the far wall | In the bay beside the sweetheart table |
    | Bar | None | Near-right corner by the corner door |
    | DJ | None | Stage-side long wall, not in the bay |
    | Left side | Only tables 1 and 3 | Tables on 3 sides |
    | Right side | 4, 5, 6 at 11 ft pitch (2 ft chair gap, the 3 flagged conflicts) | ≈13–14 ft pitch is comfortable |
    | Tables 7 and 8 | ≈1.5 ft from the dance-floor edge | — |

    **Fix:** re-run Suggest (Head on stage) so `withDance` picks 20×20, and seed bar and DJ areas per the §2 table. Or show a one-tap "Use the photo-based layout" card.
15. **The ceremony party line is lopsided.** On both Ceremony and Indoor, all 8 team members stand in one line on the left ("Left · 8 / Right · 0"). That includes Kiara and Monica, whose role is Layout & Flow, not bridesmaid. VENUE-PHOTOS §1.2 has bridesmaids left and groomsmen right. In the courtyard ceremony, the first row is 11 ft from the altar; the photos show 4–6 ft.
    - **Fix:** build the party from relation = Bridesmaid / Groomsman, not from the whole team. Add groomsman placeholders on the right. Fixing item 2 resets the stale rows.
16. **The space tab order doesn't follow the day.** "Ceremony · Indoor · Reception · Hangout spot · Tasting room" (`seating.js:29`) reads as a sequence, but cocktail hour is between ceremony and reception. Indoor is a rain plan, not a step.
    - **Fix:** use Ceremony · Cocktail hour · Reception, with "Rain plan" and "Tasting room" as smaller alternate chips. Rename "Hangout spot" to "Cocktail hour"; the agenda already titles it that, while showing the place as "Hangout spot".
17. **The suggested agenda doesn't fit the venue.**
    - Ceremony ends at 4:40 and cocktail hour starts at 4:40, with no walk from the pergola (≈100+ ft) or recessional photos. Add a 10-minute buffer.
    - Cake cutting is at 9:10pm, after 1h40 of dancing. Move it to right after the first dance (~7:25).
    - There is no golden-hour portrait slot. Sunset in Bealeton on Jun 17 is ≈8:38pm, so ~8:00–8:20 works.
    - Send-off shows "· Other". VENUE.md says the courtyard.
    - Getting ready (bridal suite, 4 vanity stations) is missing.
    - In the event panel, rename "Clear 'suggested'" to "Keep this".
18. **Seating doesn't fit one screen at 980×740.** The document is 831px tall, so the 3D/Floor-plan toggle (y 685–725) sits under the fixed footer (top 706). The help button covers "Import" in the Plan file row. "Export" and "Import" are 2.15:1 on the dark backdrop, so they look disabled. The 2D toolbar wraps and drops "Share" alone onto a second row.
    - **Fix:** size `.seat-layout` to `100dvh` minus the header, tabs and footer. Move Plan file and Share into the toolbar (Vow puts Export at top right).
19. **The floating help button covers content.** On Guests (980) it sits over the × remove button on Kiara's row. On Overview (390) it covers "Today". It is now a 40px circle (`styles.css:3023 border-radius:50%`), which conflicts with the "no circles" rule.
    - **Fix:** put it in the footer icon row next to the people icon, square with a 4px radius.

## NICE

20. **Phone guest cards.** The ⋮ and × sit side by side under the name, before the data, so delete is one slip from details. The burgundy dot on ⋮ means "missing address", with no text or aria.
    - **Fix:** use a name row with a chevron, move Remove inside details, and show a small burgundy "No address" text tag.
21. **Overview numbers read as roman numerals.** Cormorant's old-style "1" makes "12/60" look like "I 2/60". At 390 the editable "60" also wraps onto its own dotted line.
    - **Fix:** `font-variant-numeric: lining-nums tabular-nums` on the stat numbers, and `white-space: nowrap` on the value.
22. **Status words differ between pages.** Team tiles count "8 Everyone" (people) next to "8 Not started / 1 / 0 / 3" (roles, 12 in total). The Overview legend says "To do" where the dot tooltips and the Team page say "Not started". The Overview team dots carry meaning only in `title`.
    - **Fix:** label it "8 people · 12 roles", use one set of status words, and add `aria-label` to the dots or a visually hidden summary.
23. **The milestone date placeholder is cut off.** "Mar 3 or 3/3" shows as "Mar 3 or 3," at both widths. **Fix:** use "Mar 3" or widen the field.
24. **The 3D camera reads oddly from above, and on phone.** With the ceiling hidden, the 6 chandeliers (`three-view.js:350`) look like 4 gold floral clusters on the floor between tables, like phantom tables. On phone the camera crops tables 03 and 04.
    - **Fix:** hide the chandelier groups with `ceilingG`, or fade them when the camera is above `HANG`. Fit the camera to the room bounds on narrow aspect ratios.
25. **Taste versus Betel's board and the Vow inspo.** The moss-green masthead, wine footer and green help button make a heavy red/green pairing; Vow uses cream chrome with one dark accent. The hero is a pale daytime lawn photo under a milky overlay. Her board is moody burgundy, pink and green satin on cream.
    - **Fix:** use a cream masthead with wine type and a green active underline, as in Vow. Swap the hero to the Palacio at dusk photo (#023) with a flat darker overlay. Ask Kiara before changing the brand colours.

## Checked and fine
- Contrast scans with `getComputedStyle` pass on Overview cards, Team cards, Guests, Agenda blocks and the Seating sidebar; the only miss is item 18.
- Agenda blocks are `role=button` with time labels.
- The live popover traps focus and Esc closes it.
- Start over uses `confirmDialog`, not `confirm()`.
- No console errors on any route.
- Route changes render in ~25 ms with no reload flash.
- The ballroom shell matches VENUE.md: bay ≈20×15 outside the hall at y 41 (34 ft from the balcony end), 5 arched doors at a 9 ft pitch, two double doors at x 16 and 31, corner doors, 12 ft balcony keep-out.

---

## Common web UI patterns → what we should do

*(Addendum for Kiara: design direction.)* Each control family below is mapped to the familiar web pattern, then given a concrete recommendation that stays inside our rules: no gradients or art, corners 2–6px, no hover movement, flat tints, AA contrast.

### How the CSS is built today

The patterns below can't settle until this is cleaned up, so it comes first.

`styles.css` is 3,004 lines of re-skins stacked on top of each other. Later blocks override earlier ones instead of replacing them:
- The colour tokens are declared three times: `:root` at l.4, l.1777 and l.2066. `--gold` is gold, then "dusty rose" `#b9848e`, then brown `#8a6b5a`.
- Some selectors are declared many times: `.mainnav a` 11×, `.select` 19×, `.guide-q` 20×, `.pop` 13×, `.toast` 8×.
- `border-radius: 99px` / `50%` still appears 75×. It is only hidden by later 3px overrides, so any new rule that comes first can bring pills back.

**Recommendation:** freeze the look into one token block plus one component layer (`/* tokens */`, `/* components */`, `/* pages */`) and delete the superseded blocks. Measured at runtime on all 5 routes, every control already resolves to a 3px radius. The cleanup changes nothing visually; it just makes the patterns below stick.

### Measured inconsistencies (runtime, 980px)

| Thing | What varies | Where |
|---|---|---|
| Control height | 18, 24, 28, 30, 34, 35, 36, 38, 39, 40, 44px | Across pages |
| Primary fill | moss `rgb(47,61,51)` | Guests "Add", Agenda "+ Event" |
| | wine `rgb(94,26,41)` | Guests "List" segmented-on |
| | moss `rgb(47,56,35)` | Seating "3D view" segmented-on |
| | dark glass | Team status tiles |
| | pink tint `rgb(244,234,232)` | Guest filter "on" |
| "In progress" colour | amber `#d9a21b` | Overview dots (`--st-prog`, l.2368) |
| | pink `#d9959b` | Team `.stbtn.in-progress` (l.2038) |
| Focus ring | gold, wine, white, ink, `#2f3823`, `#26311f`, `#6b1f2a`, ivory | 9 colours over 48 `:focus-visible` rules |
| | `outline: none` | 9 rules, with only a border-bottom change as replacement |

---

### 1. Dropdowns and select menus
- **Now:**
  - Native `<select class="select">` in the guest table (30 per 12 guests), Team "All roles", Seating "Color by" and the guest details.
  - Glass background plus an SVG chevron (`styles.css:2246`).
  - A custom listbox for the guest filter (`.gf-btn` / `.gf-menu role=listbox`, `app.js:484`) with no arrow-key support. `role=listbox` promises Up/Down/Home/End/type-ahead, and there is no keyboard handler in `app.js`.
  - The colour menu on Team cards (`.tc-menu role=menu`).
- **Common pattern:** use a native select for short single choices in forms and tables; it's free on mobile and accessible. Use a custom glass listbox only where you need groups, counts or rich rows. Rows have a check on the selected item, and the trigger has a chevron that turns on open.
- **Recommendation:**
  - (a) Keep native selects for RSVP, Meal, Side, Relation, Colour by and Roles. Make them look identical: 34px tall, 3px radius, 1px `--line-strong` border, chevron 10×6 at right 10px, the same font. Drop `backdrop-filter` on selects inside tables; glass on 30 table cells is just cost.
  - (b) Keep the guest-filter custom menu (it needs counts), but make it a real listbox:
    - arrow keys, Home/End, Enter, Esc, type-ahead
    - `aria-activedescendant`
    - a ✓ glyph on the selected row instead of the pink fill
    - hide zero-count options
    - cap it to about 10 visible rows with headings.
  - (c) Flat menu surface: card colour, 1px line and a 6px shadow, no blur. Blur only where a photo sits behind.
- **Consistent across pages?** No. Native and custom styles are mixed, and the selected state shows as a pink fill in one place and native checks in another.

### 2. Buttons
- **Now:**
  - `.btn.moss` primary, `.btn.line` secondary, `.linkbtn` / `.live-txt` text buttons, `.tool.icon` 44px icon buttons, `.icon-btn` 36px, `.x` 30px, `.more.addr-btn` 30px.
  - `.btn.gold`, `.cd-yes` (wine) and `.hero-exp` (glass) as extra primaries.
  - Disabled is `opacity:.6` (l.72); Undo in the toolbar is a pale grey label.
  - No loading state. "Send link" swaps the note text but the button stays live.
- **Common pattern:** one primary per view; secondary is outlined; tertiary or ghost is text; icon buttons get a tooltip and aria-label; destructive is red but only inside confirms. States: hover darkens, pressed darkens more, disabled is a lower-contrast fill (not opacity) with `aria-disabled`, loading shows an inline spinner plus a verb ("Sending…") and locks the button.
- **Recommendation:**
  - Primary = wine `#6e1f2e` on ivory, hover `#5a1822`.
  - Secondary = 1px wine-tinted border, transparent.
  - Ghost = text with an underline on hover.
  - Icon = 36px square with a 3px radius.
  - Danger = wine text in confirms only.
  - Two sizes only: 36px (default) and 30px (dense rows); 44px touch targets on ≤760px.
  - Disabled = `--paper-2` fill with `--ink-faint` text (still ≥3:1 for the shape).
  - Loading = 12px spinner plus "Saving…", `aria-busy`.
  - Retire `.btn.gold` and the moss primary so the 3D toggle, Guests "List" and "+ Event" all use the same primary.
- **Consistent?** No. There are four different primary fills.

### 3. Hover, focus and active states
- **Now:** hovers are colour or underline only. Good, and no lift found: `:hover` with transform is zero after overrides. Focus rings come in 9 colours; 9 rules remove the outline.
- **Common pattern:** hover is a colour or underline change. `:focus-visible` gets one consistent 2px ring with a 2px offset at ≥3:1 against every background. Active (pressed) is a darker tint. Selected is a persistent fill or underline, separate from hover.
- **Recommendation:**
  - One token `--focus: #2a1a1d` (ink) on light, `#fff` on dark or photo, with `outline: 2px solid var(--focus); outline-offset: 2px`.
  - Inputs keep a 1px wine border plus a 2px ring on focus.
  - Replace every `outline:none` + border-bottom with the standard ring.
  - Hover tint = 6% ink overlay on light surfaces and 12% white on dark.
- **Consistent?** No, because of the focus colours.

### 4. Tabs and segmented toggles
- **Now:**
  - Space tabs (`.spaces`, serif 29px text, wine sliding underline `.spaces-ink`).
  - Sidebar tabs (`.vs-tabs`: icon, label and underline).
  - Guests "List | Connections" (`.viewseg`, `role=tablist`; the CSS still says 99px, though runtime shows 3px).
  - Seating "3D view | Floor plan" (glass box with a moss "on" fill).
  - Team status tiles (`aria-pressed` filter buttons).
  - None of the `role=tab` sets support Left/Right arrow keys.
- **Common pattern:**
  - **Tabs** switch content panels: underline on the selected tab, roving tabindex with arrow keys, `aria-controls`.
  - **Segmented control** (Vow "3D | Floor plan"): 2–3 options in one container, the selected one gets a filled tile, behaves like a radio group.
  - **Filter chips**: toggle buttons with `aria-pressed`.
- **Recommendation:**
  - Space tabs and sidebar tabs: one tab style (underline, wine 2px, label ink-soft → ink when selected) with arrow-key roving.
  - Use **one** segmented component for "3D | Floor plan", "List | Connections", "Feet | Metres" and "Color by" if it stays short: container with a 1px line and 4px radius, selected tile with a solid wine fill and ivory text, 36px tall, `role=radiogroup` with arrow keys.
  - Team status tiles are filters, so they should look like filter chips (outline, wine fill when on), not like the big dark glass tiles.
- **Consistent?** No. There are three looks for the same "pick one view" job.

### 5. Popovers, menus and tooltips
- **Now:**
  - Table popover `.pop` with a glide animation.
  - Edit together `.live-pop` (`role=dialog`, focus trap).
  - `.tip` CSS-only tooltips via `::after`. The content is not in the accessibility tree, and nothing appears on touch.
  - Meaningful info lives only in `title` (clearance list, team dots, "Details" dot).
- **Common pattern:**
  - A popover anchors to its trigger, has an arrow or offset, and Esc or an outside click closes it and returns focus. Menus get `role=menu` with arrow keys.
  - Tooltips are for **supplementary** labels only: shown on hover and focus after ~400ms, dismissed with Esc, linked by `aria-describedby`.
  - Information people need goes in visible text or a popover, never only in a tooltip.
- **Recommendation:**
  - Keep the glass for popovers that float over the 3D or photo; use card-flat elsewhere. 6px radius, 12px padding, 1px line.
  - One `Tooltip` helper (a real element with `role=tooltip` and `aria-describedby`) for icon buttons.
  - Move clearance, the team-dot meaning and the missing-address flag into visible text or popovers.
- **Consistent?** Partly. Popovers are consistent; tooltips and `title` usage are not.

### 6. Modals and confirm dialogs
- **Now:** `confirmDialog()` (`util.js:31`): glass `role=alertdialog`, Cancel focused first, Esc and outside click cancel, Tab cycles. Good. History is a right-hand drawer, and the person popup is `.pp`. But `window.prompt` is still used in `sync.js:145`.
- **Common pattern:** confirms only for destructive or irreversible actions. Title as a question, body with the consequence, a verb on the button ("Delete table 4", not "Confirm"), safe default focused. Reversible actions get an Undo toast instead of a confirm. Drawers for history or detail panes.
- **Recommendation:**
  - Keep the pattern. Always pass a specific verb label.
  - Replace `window.prompt` with a `confirmDialog` variant that has an input.
  - Never confirm for reversible edits; you already use Undo toasts for those, keep that.
  - Live destructive actions say who is affected (see finding 9).
- **Consistent?** Yes, apart from `window.prompt`.

### 7. Tables and rows
- **Now:**
  - `table.guests`: each cell is always-visible native controls (30 selects plus 10 inputs for 12 guests).
  - Row hover tint (l.2273).
  - The header is **not sticky**.
  - Actions are ⋮ (details) and × (remove) per row.
  - The phone view becomes cards with actions before the data.
- **Common pattern:** Notion or Airtable-style inline cells. The cell reads as plain text and shows a chevron or border only on hover or focus; Enter opens the editor, Esc reverts. Sticky header, row hover, a selected row, a trailing ⋯ row menu holding Remove, and bulk select for big lists. On phone, a list row with a chevron opens a detail sheet.
- **Recommendation:**
  - Cells render as text spans; on focus or click, swap in the select or input (this also cuts 180 live selects at 60 guests).
  - Sticky `thead` under the masthead.
  - Row hover = 4% wine tint.
  - Put Remove inside the ⋯ menu or details, not as a bare ×.
  - Add a checkbox column for bulk RSVP or meal.
  - Phone: name + one status line + chevron, with details in a bottom sheet.
- **Consistent?** No. Team cards use inline edit chips, Guests uses always-on selects, Agenda uses a side panel.

### 8. Forms and validation
- **Now:**
  - Quick-add inputs ("Add guests", "Add a milestone", "+ Role"): underline style, `outline:none`.
  - No `aria-invalid` anywhere.
  - The bad date in "Mar 3 or 3/3" has no visible error pattern.
  - Gate error via `role=alert`. Good.
- **Common pattern:** label above or inside (floating), helper text below, error text in place with `aria-invalid` + `aria-describedby`, validate on blur or submit (not each keystroke), keep the user's input, a short example placeholder.
- **Recommendation:**
  - Fields use one style: 36px, 1px border, 3px radius.
  - Underline-only inputs only for inline title renames.
  - Error = wine text 12px under the field, a wine border and `aria-invalid`.
  - Placeholder = an example, not instructions ("Mar 3").
  - Quick-add rows: Enter submits, the field clears, focus stays.
- **Consistent?** No. Bordered and underline fields are mixed, and there is no error state.

### 9. Toasts with Undo
- **Now:** one `#toast` (`util.js:5`): glass moss, 5px radius. Undo lasts 6s, errors 7s, info 3.6s. A new toast replaces the old one, so its Undo is lost. No pause on hover or focus. The header has an Undo too.
- **Common pattern:** bottom-centre or bottom-left, one line plus an action, ≥8–10s when there is an action, paused while hovered or focused, Ctrl/Cmd+Z for the last action, stacking or queueing so a second action doesn't swallow the first Undo.
- **Recommendation:**
  - Keep the plain flat rectangle (rule).
  - Make it solid `--ink` / ivory, not glass, so contrast doesn't depend on what's behind it.
  - 10s with Undo, paused on hover and focus.
  - Queue the messages.
  - Bind Ctrl/Cmd+Z to the same undo stack as the header Undo.
- **Consistent?** Yes. One toast is used everywhere.

### 10. Empty states
- **Now:**
  - "No guests yet." (`app.js:571`, a muted paragraph).
  - "0 guests still need a seat." (reads like an error).
  - Empty tables show "0/8".
  - Dashed slots in the seat list. The Agenda has an empty-state CTA.
- **Common pattern:** say what's here and give the next action. Use one line of text plus a primary action, and celebrate "done" states.
- **Recommendation:**
  - Template: short title + one line + one button, e.g. "No guests yet / Paste a list or add one / [Add guests]" and "Everyone has a seat ✓".
  - No illustrations (rule); type only.
- **Consistent?** No.

### 11. Loading and skeleton states
- **Now:**
  - The 3D has a spinner plus text (`.three-loading`, l.2352).
  - Live status words "Connecting…" / "Reconnecting…" appear only in the footer tooltip and the popover.
  - Everything else is local and instant.
- **Common pattern:** skeleton blocks the size of the final content for >300ms waits. Spinners only for small inline waits. Visible sync status ("Saved", "Saving…", "Offline").
- **Recommendation:**
  - 3D: a flat `--paper-2` skeleton the size of the stage, with the toolbar already in place and a one-line "Building the ballroom…".
  - Show sync state next to the footer people icon ("Live", "Saving…", "Offline · changes kept here"), like Vow's "✓ Saved" at top right.
- **Consistent?** N/A (only one loader). Sync visibility is missing.

### 12. Badges and status chips
- **Now:**
  - Team: status as icon + text (`.stbtn`).
  - Overview: unlabeled dots.
  - Guests: RSVP shown as a coloured select value (`.select.rsvp[data-v]`) and a dashed or dotted ⋮ for missing address.
  - Agenda: "SUGGESTED" caps label.
  - Seating: "Clearance: 3 conflicts" in red text.
  - The "In progress" colour differs (amber vs pink).
- **Common pattern:** one status component, a small flat-tint chip with a dot (or icon) + text. Colour is never the only signal; same colours everywhere.
- **Recommendation:** a `Status` chip that is 20px tall with a 3px radius (squared, not a pill), a flat tint background, ink text and a 6px dot. Five tones, and use them everywhere: dots, RSVP, agenda tag, clearance.

  | Status | Colour |
  |---|---|
  | To do / Invited | grey |
  | In progress / Maybe | rose |
  | Waiting / Needs action | wine |
  | Done / Yes | green |
  | Declined | faint grey with line-through |

  Drop the amber `#d9a21b`; DESIGN-RULES says less gold, and use burgundy for warnings.
- **Consistent?** No.

### 13. Cards
- **Now:**
  - Overview glass cards: 6px radius, blur, shadow.
  - Team cards: solid pink, burgundy or green fill, all the same size. Good.
  - The "+ Add someone" card is dashed.
  - Earlier rules (l.2083) turn cards into top-rule-only sections, which a later glass block overrides.
- **Common pattern:** a card is a bordered container with one job; same padding, radius and header style; interactive cards show a hover tint and a focus ring.
- **Recommendation:**
  - One card with 16px padding, a 4px radius and a 1px line.
  - No blur when the background is plain cream; blur only over photos (Team page, seating backdrop).
  - Header = small caps label + an optional action at right, like Overview's "Milestones" / "Team".
  - Keep the filled colour cards for Team (owner rule).
- **Consistent?** Mostly yes after the overrides. The source is not.

### 14. Navigation (desktop and phone)
- **Now:**
  - Desktop: green masthead, uppercase 13px links, underline on the active link.
  - Phone: the same links in a row under the brand (the 320px scroll is being fixed).
  - Footer: "Morais Vineyards" link + people icon (+ hidden History / Start fresh).
  - Help "?" floats bottom-right.
- **Common pattern:**
  - Desktop: top bar with brand at left, 4–6 sections, active underline, utility icons at right (help, share, account, sync status).
  - Phone with ≤5 sections: a fixed **bottom tab bar** (icon + label, 56px, safe-area padding), or an evenly split top row with no scroll.
  - Utilities go into the bar, not floating.
- **Recommendation:**
  - Desktop: keep the top bar. Move "?" and the people icon + sync dot into the right of the masthead; footer = venue link only.
  - Phone: 5 equal top-row cells (no scroll) or a bottom tab bar with 1.6-stroke icons. Never both a bottom footer bar **and** a floating help button, which today stack three layers at the bottom of the screen.
- **Consistent?** Yes across pages; the structure is what needs to change.

### 15. Iconography
- **Now:**
  - Inline SVG, mostly 24-unit viewBox, stroke 1.6 (13×), plus 1.7 (3×).
  - Rendered at 13, 15, 16, 17, 18, 20 and 24px.
  - Some "icons" are text glyphs: "×", "+", "−", "↗", "⋮" in a 4×16 svg, "ⓘ".
- **Common pattern:** one icon set with one stroke weight, 16px in dense UI and 20px in toolbars, text glyphs replaced by SVG so weights match, `aria-hidden` on decoration and a label on the button.
- **Recommendation:**
  - Standardise on 1.6 stroke, round caps.
  - Sizes: 16px (inline and rows) and 20px (toolbars and nav).
  - Replace ×, +, −, ↗ and ⓘ with SVGs from the same family so they match.
  - Keep icons functional only (no decorative art, per the rule).
- **Consistent?** Mostly. The text glyphs break it.

---

## Design direction (one page for Kiara)

**What it should feel like:** Vow's airy editorial structure dressed in Betel's palette. A cream page, one dark accent (wine), green and pink used only as data colours (team cards, status, sides). The 3D scene or a real Morais photo is the hero; everything else is quiet and gets out of its way.

**Five decisions that fix most of what feels "off":**
1. **One primary colour: wine.** Primary buttons, the selected segment, the active tab underline, the focus ring on light surfaces. Moss green leaves the chrome (masthead, buttons) and stays only as the "Carter" / "Done" data colour. That ends the red-and-green holiday feel.
2. **Cream chrome, like Vow.** Cream masthead with ink type and a wine active underline. Footer = the venue name only. The help, people and sync icons move into the masthead's right side, so nothing floats over content on desktop and phone.
3. **Glass only over photos and the 3D.** Seating toolbar, the 3D/Plan toggle, popovers over the scene, the Team page over its photo. Everywhere else is flat cream cards with a 1px line and a 4px radius. Less blur means a calmer look and faster phones.
4. **One component per job:**

   | Job | Component |
   |---|---|
   | Pick a view | one segmented control |
   | Switch panel | one tab style |
   | Filter | one chip style |
   | Pick a value | native select |
   | Show state | one status chip with five tones |
   | Undo | one toast with a 10s Undo that pauses on hover |
   | Confirm | the glass confirm, used only when the change can't be undone |

5. **Sizes and type on a scale.**
   - Controls are 36px (30px dense, 44px touch).
   - Radius is 3px on controls, 4px on cards, 6px on floating layers.
   - Icons are 16 or 20px at 1.6 stroke.
   - Cormorant for page titles and big numbers, with lining numerals; Inter 13–14px for everything else.
   - Small caps labels at 11px with .08em tracking.

**Rules to keep saying yes to:** no gradients or art; corners 2–6px; hover = colour or underline, never movement; every status has text, not just colour; AA contrast checked on the real background (photo or glass included); motion only for state changes (table glide, view switch, seat pop) and none when `prefers-reduced-motion` is set.

**Housekeeping that makes this stick:** collapse `styles.css` into tokens, components and pages, and delete the superseded re-skins. Today the same control is restyled up to 20 times, and the next small change will bring back pills or a stray colour.
