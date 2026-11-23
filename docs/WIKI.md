# Betel & Carter site wiki (for agents and editors)

Read this before changing a feature. Decisions and their reasons are in `DECISIONS.md`: add a row there whenever you make or learn one. Public repo: never put private details (emails, health info, personal notes, keys) in any file.

## What the site is
A static, vanilla-JS wedding planner for the couple's team. Pages: Overview, Team, Guests, Agenda, Seating (venue map, then Reception / Ceremony / Hangout spot / Tasting room). Hosted on GitHub Pages from `main` (every push to `main` deploys in about a minute). The main purpose is **seating**: Edit seats must never be buried by other features.

## Run, test, ship
- Run: `python -m http.server 5173` in the repo folder, open `http://127.0.0.N:5173` (each `127.0.0.N` origin has clean storage; useful for fresh-user tests).
- Tests: `for t in tests/*.test.mjs; do node $t; done` (guest parsing, merging, suggest, soft blockers, sync merge). Add a test for any merge/layout logic you touch.
- Branch per change (`fb/<slug>`), merge with `git merge --no-ff`, push `main`. Keep `RELEASE-NOTES.md` current. Update the dev board (`../wedding-dev-board`, `node board.mjs add|note|done`) after every ticket (see `CLAUDE.md`).
- **Cache busting:** phones cache files for ~10 minutes. When `styles.css` changes, bump `?v=` on the stylesheet link in `index.html`. Tell the owner to close and reopen the tab, and wait about two minutes after a push.
- Do not edit Firestore rules. `FIRESTORE-RULES.txt` documents them; the owner publishes changes herself.

## Code map (`js/`)
| File | Job |
|---|---|
| `app.js` | Router, Overview (Next up, metrics, guest dots), Team, Guests table, nav menu |
| `store.js` | The plan state (`state`), load/save to localStorage (`betel-carter-atelier`), `commit()`, `undoable()`, `healSeats()` (self-healing + migrations), merge with remote |
| `data.js` | Seeds: reception room/tables, ceremony/cocktail/tasting spaces, photos, milestones |
| `seating.js` | The whole Seating area: venue map hand-off, plan SVG editor, 3D mount, toolbars, Suggest, Look pickers, side panels |
| `layout.js` | Pure layout math: table styles, `suggestTables`, clearance checks, `chairPositions`, `autoSeat` |
| `three-view.js` / `three-style.js` | three.js scene (room, tables, chairs, lighting) and the Look variants (canopy, aisle, candles...) |
| `style-options.js` | The Look groups/options, `resolveStyle`, the pickers' HTML |
| `spaces.js` | Ceremony/hangout tools, wedding party dots, rows editor |
| `venue-map.js` | The aerial map page: labels, photo tabs and gallery, lightbox |
| `sync.js`, `sync-merge.js`, `merge-items.js` | Firebase sign-in, Firestore plan doc (`plans/main`), transactions with a revision number, three-way merge by item id |
| `history.js` | Revision history (snapshots after saves; changes adopted from other editors are credited) |
| `guide.js` | Page tours (`?` button) and the one-time update tour (moving ring + tip) |
| `changelog.js` | The "What's new" bell (see the bell rules in `DECISIONS.md`) |
| `features.js` | Feature switches: `rsvp` and `address` are off (hidden UI, data kept) |
| `guest-*.js`, `person.js`, `catering.js`, `connections.js`, `agenda.js`, `team-*.js`, `ai.js`, `address.js`, `feedback.js`, `saved.js`, `team-colors.js`, `util.js` | Smaller features and helpers |

## State shape (top-level keys of `state`)
`people`, `roles` (each may carry an optional `due` date, `YYYY-MM-DD`: set in a task's edit form, shown on the card and in Next up), `guests`, `autoGuests`, `guestTarget` (100), `tables` + `room` (the reception), `spaces` (ceremony / indoor / cocktail / tasting), `links` (guest connections), `mood`, `style` (Look picks; only non-default values), `milestones`, `morais` (photo order), `agenda`, `guestCols`, `updatedAt`. Units are **feet** everywhere (no metres UI).
- Adding a top-level key: add it to `fresh()` in `store.js`, check `mergePart` handling in `store.js`/`merge-items.js`, add a label in `history.js` `LABEL`, and make sure it saves and syncs.
- Migrations live in `healSeats()` (runs on load). Rule: change a saved plan **only** if it still equals the old default exactly; keep table ids and seatings; use fixed ids for new items (two devices must never invent different ones); never fewer tables than she has; make it a no-op on the second run. Test with a copy of the old layout, an edited layout, and a second run.

## Overview: Next up and the guest dots
- The top row is **Next up** (left) and the **guest dots** (right); on phones they stack. Tasks done and Days left sit under them.
- **Next up** shows the 3 most useful things right now, numbered 1-3, each with a status line (and a date plus days left for a milestone). Sources, in priority order (built in `app.js`, `pool`): tasks due within 14 days or overdue; tasks Waiting on bride; a milestone within 45 days; tasks In progress; guests still to seat; an empty agenda; guests still to add; tasks Not started; the next milestone whenever it is. To add a source, add it to `pool` in the right priority spot and give it a short status line.

## Seating specifics
- Reception = `state.room` + `state.tables`; other spaces = `state.spaces[id]`. `kindOf()` is `reception | ceremony | cocktail`.
- Default reception: rounds of 8 for 100 guests, no dance floor (add one from More). The ballroom seats at most 84 at rounds; 100 needs long family rows (Suggest switches to them and says so). Suggest picks the style closest to the chosen one that seats everyone, else the one that seats the most, and says how many.
- Ceremony default: 10 rows a side, 100 chairs (identical to what Suggest produces).
- One **3D | Plan** switch sits top-left of the card on every space, same spot in both views (`.view-fixed`). Do not add other view buttons.
- Look picks: `localUndo(...)` -> `resync()` -> the 3D scene is swapped **in place** (`open3d({ view, old })`): no loader, same camera and lighting. Ceiling picks glide the camera up (`lookUp()`). On phones the 3D is pinned under the header while the Look tab is open.
- The 3D loop renders only while something moves (idle saver in `three-view.js`); anything that changes the scene without input must call `wake()`.
- The Look picker is an accordion: one group open at a time, the current pick in the header.

## Design rules (short; full text in `DESIGN-RULES.md` and the skills)
Flat colour, square corners, no gradients, no hover motion, minimal copy, no generated art or initials. Calm and low-clutter: one obvious next step per screen, nothing resets the user's place, a visible "Saved", Undo on changes, tuck secondary things behind "More", short animations only. Phone first: one-line guest rows, one-row header with a menu button, targets about 40px (not a top priority, keep them reasonable).

## CSS gotchas
- `styles.css` was built in layers (later rules override earlier ones, many with `!important`). To change something on a phone Guests row you may need `html body[data-route="guests"] table.guests tr.row ... !important`. Check the computed style in the browser before and after; never assume.
- The Overview cards drop blur, mask and entry animation on phones on purpose (scroll flicker on iOS).
- The Saved check uses a CSS escape in `content`; write real characters or double-check it renders.

## Things that are deliberately NOT here
RSVP tracking and address collection (the bride uses RSVPify). Flip `js/features.js` to bring the UI back; data is kept. Metres. A dance floor by default. Bell posts that are not big, visible features.

## Testing without a real phone
Resize the preview to 390 or 430 wide (a background browser tab does not run animation frames: bring the tab to the front). Check: no sideways scroll, controls reachable, one-handed use. Real-device checks (iPhone Safari scroll flicker, touch) can only be confirmed by the owner: say so in the ticket note.
