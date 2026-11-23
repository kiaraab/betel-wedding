# Release notes

For the owner (Kiara). Betel and the team only see the one-line bell, so details live here.
Newest first. Each release is a git tag: you can always go back.

## How to go back
- **Look at an old version:** `git switch --detach v2026.11.22` (then `git switch main` to return).
- **Undo one change but keep everything else:** `git revert <sha>` (for a merged branch: `git revert -m 1 <merge-sha>`), then `git push`.
- **Put the live site back exactly as it was at a tag** (creates a new commit, nothing is lost): `git revert --no-edit v2026.11.23-a..HEAD` then `git push`.
- GitHub Pages redeploys in about a minute after any push. Ask Claude and it will do any of these.

## How changes ship from now on
Each ticket is a branch (`fb/<ticket>`), tested, then merged into `main` with `--no-ff` (one revertable merge per change) and the release is tagged. Details in the `betel-ship` skill.

---

## Unreleased (on main, not tagged yet)
- **Wedding party by category (REQ-89):** who stands at the altar now comes from the Relationship on the Guests page: **Bridesmaid** on the left, **Groomsman** on the right (before, the whole Team stood on the left). Team members keep their saved order. Anyone you set to "—" leaves the party. **Action for Kiara:** Kiara and Monica show as Bridesmaid by default (team default), so set their Relationship to "—" on the Guests page if they should not stand at the altar.
- **Venue photos (REQ-111, part):** 9 people-free photos from the visit are in the Seating gallery, tagged to places (`assets/venue/visit/`). 7 more with people in frame are held back (public repo) until Kiara says yes. Pinterest board not imported yet.
- **Seating and floor plan on phones (mobile pass):**
  - 3D: the home view now pulls back to fit the room's width on a tall narrow screen (it only showed the middle of the room), and the toolbar fits inside the picture (it was clipped on the left).
  - **Tables always appear in 3D (old QA-24):** tables pop in on real time. Before, a per-frame-capped clock left them invisible on slow or throttled renders.
  - Floor plan: the plan uses the full card width and its height follows the room (Ceremony, Hangout and Tasting had a 600 px box with empty bands above and below); the toolbar stays inside the card.
  - Seat guests: natural height, 46 px rows and bigger "Seat at…" buttons instead of a tiny scroll box.
  - Reception editor: the plan comes first, the settings panel below.
  - Not done: the table popover (tap a table), the Look tab, and bigger tap targets for tables on the small plan were not reviewed. Checked at 375 px in a desktop preview, not on a real phone.
- **Reception editor on phones (REQ-113):** the plan and its toolbar now come first and the settings panel (Layout / Seat guests / Look) is below it. Before, the panel took the whole first screen and the plan started 740 px down. Ceremony and Hangout spot already put the plan first. Checked at 375 px, not on a real phone.
- **Guests on phones are roomier (REQ-140, from the feedback box):** each guest is two lines now: the name (bigger) with the details and remove buttons on top, and Side, RSVP (with its word) and Relationship in three even boxes below with full text instead of "Brides…". The header labels sit over the three boxes. (The feedback box note was read as "too dark" at first; the real point was "cramped on mobile". The brighter page background from that first reading stays: a plain off-white page with a flat grid. To undo it: `git revert -m 1 0203eca`.)
- **Two editors at once (REQ-103):** if Betel edits one guest while Carter edits another (or each adds a guest), both changes now survive. Guests, tables, roles, Agenda, team and milestones merge item by item; if both change the same item, the person who is saving wins. Tests: `tests/merge-items.test.mjs`. Still not covered: the save to Firestore is still a whole-plan write, so two saves in the same instant can race; and Revision history does not record other people's changes.
- **Install on the phone (REQ-120):** `manifest.webmanifest`, home screen icons (drawn from the B and C hearts: `assets/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) and a theme color. The bell has **Add to Home Screen** with iPhone and Android steps (edit the text in `js/homescreen.js`). The icon is an approximation of the logo (two hearts with a script B and C), not the exact artwork. Not tested on a real phone.
- **Expected guests minimum is 2** everywhere (the couple always counts) (REQ-94).
- **One photo gallery on the Seating map:** clicking an area no longer shows a second set of photos. The pop-up has the name, Edit seats and "See N photos below"; the gallery below starts as one page (12 on phones, 24 on desktop) with a **See all** button, and follows the area you pick (the map lights it up). Show fewer collapses it.
- **Connections graph (REQ-115):** Love is a thick solid line with a heart, Like is thin and dotted, Apart is long grey dashes (so they differ by shape, not only colour). With a long guest list the canvas grows (phones scroll sideways inside it) and people keep a minimum distance. The list under the graph has Love / Like / Apart buttons per link, so you can change a relationship without redrawing it. Tested with 100 guests and 42 links at 375px.
- **Seating map page on phones (REQ-113):** the photo gallery shows 12 at a time (24 on desktop) with Show more; the page went from about 6,700 px tall to about 1,500 px. The Reception, Ceremony and Hangout editor pages were not changed.
- **Photo filter lights up its place (REQ-114):** choosing Ceremony, Reception and so on dims the rest of the map and lights up that area; on phones the map pans to it.
- **Clearance (REQ-112):** see below under -b (shipped).

## v2026.11.23-b  (Nov 23, afternoon)
**Planning for 100 guests**
- Default expected guests is 100. At 100, only "Family rows" fits the ballroom (rounds top out at 76 to 88 seats), so Suggest now explains and switches to a style that seats everyone. Ceremony and Hangout spot fit 100; the Tasting room fits only 4 of the 10 high-tops needed. The ballroom size is still an estimate until Morais sends the real plan.
- Guests table on desktop is a Notion-style grid: light grey header, thin borders, cells edited in place, sticky header, compact rows.
- Satellite map opens close in on the buildings (zoom 18) and fits the phone.

**Feedback box**
- Bell > Send feedback (Request or Something broke). Saved to Firestore, with an offline queue. Owner exports from the Live panel (Feedback); `wedding-dev-board/feedback-to-board.mjs` turns the export into tickets. Skill: `betel-feedback`.
- The `feedback` Firestore rule was published by the owner on Nov 23 (see `FIRESTORE-RULES.txt`). Verified live in the Firebase console (Nov 23, 1:51 AM version contains the feedback rule). A real send from a signed-in browser is still untested.

**Smaller**
- Clearance: outside the Reception, dropping a table only bounces on real overlaps (no 3 ft ring around the fountain, 1 ft between standing tables). Clearer message.
- Notifications can be x-ed out; remembered per browser. The sign-in reminder stops after an x.
- The bell is one short line. Updates are only posted when the owner asks.
- Add guests has its own row on phones.

## v2026.11.23-a  (Nov 23, morning)
- **AI:** Read with AI no longer gets stuck when a model is busy (15 s per model, then the next). If Agenda Suggest fails, the basic plan shows as a preview instead of being added. The AI prompt keeps the ceremony time, walking buffers and golden hour.
- **Sign-in:** things added before the first sign-in are kept on top of the shared plan (unit test).
- **Phones:** guest list has column names and a working column toggle (Table, Household, Plus-one, Notes show under the name); Agenda scrolls with the page (tap edits, hold to drag); Ceremony has "Chairs per row" steppers; Live panel is half the height.
- **Ceremony:** readable chairs; groomsmen are real guests that show on the Guests page; an Agenda card under Plan tools.
- **Guests:** lighter, thinner type; the dot on the details button means "no seat yet"; addresses are optional.
- **Look:** B and C centered in their hearts; the What's new bell.
- **Paste a list:** understands side headings ("Carter's side:"), skips totals, "bringing a date", "from work", kids lists.

## v2026.11.22  (Nov 22)
Lock screen with aerial photo and heart unlock; Morais overview map (aerial with outlines + satellite) with grouped photos; Notion-style Agenda; glass masthead and cleanup of the stylesheet; catering list (print / CSV); access flow (new sign-ins ask automatically, owner approves, pre-approved emails); address autofill (Places API New); one-line guest rows on phones; review fixes (seat healing, space migration, sign-in reconnect).

---

## Still open (as of Nov 23)
REQ-113 Seating on phone, REQ-115 graph and Love/Like, REQ-111 photo library (needs files), REQ-114 filter highlight, REQ-120 Home Screen guide, REQ-121 3D for other places, REQ-122 tell Betel at launch, QA-24 (3D empty on first visit, could not reproduce).

- Household is now a dropdown (pick one or add new), so names stay consistent.

- Household is now a dropdown (pick one or add new), so names stay consistent.

- 3D view for Ceremony, Hangout and Tasting (toggle in the seating toolbar). Bell: new entry.

- Seating on phones: bigger tap targets (space tabs, Undo, links).

- Phone: the table sheet no longer hides behind the bottom bar; its buttons are easier to tap.

- Venue photos: flat place tabs joined to the map; tapping a place on the map filters the photos and shows its details and Edit seats.

- 3D: evening look from Betel's Pinterest: string lights, chocolate and olive tables with tall candles, new chairs, chiffon and greenery at the ceremony, mirror aisle.

- Seating map: tap a place and a clear "Edit seats" button appears with its details.

- 3D decor options (Look): canopy, aisle, backdrop, arch florals, table dressing, candles, ceiling, centerpieces, grazing/bar, guest extras. Bridesmaid figures use their Team card color. Bell: new entry.

- Seating defaults to 100 guests: ceremony has 10 rows a side (100 chairs), new plans start with a 100-seat reception.

- 3D view only redraws while something moves, so phones and laptops stay cooler.

- Suggest now lays out the most the room can seat when it cannot fit everyone, and says how many it holds.

- Changing a look no longer reloads the 3D scene: it swaps in place and keeps your camera and lighting.

- Reception starts from the 100-guest default (rounds of 8); a reception still on the original layout updates to it automatically, with everyone keeping their table.

- A quiet "Saved" appears after every change; Look picks can be undone; the help button no longer pulses; Tasting room has its own wording.

- Overview opens with a Next up card (1-3 things to do now). Look shows one group at a time, with your current pick in the header.

- Phone header is one row with a menu button; the sections open as a list. The Overview title no longer touches the photo on narrower phones.

- Seating pages: the venue photo strip folds away (starts folded on phones, remembers your choice).

- Fixed: Look picks on the Reception now update the 3D scene (and Undo does too); on a phone the 3D stays pinned while you pick; a ceiling pick glides up to show it.
- One 3D | Plan switch in the same place on every space.
- A short "what got easier" guide shows once on next open.

- The 3D | Plan switch stays in exactly the same spot when you switch views; the Reception floor plan lost its extra banner and duplicate 3D buttons.

- Phones: bigger touch targets across pages; steadier Overview scrolling (no blur/mask/animation stacking); more room under the toolbar on the floor plan.

- Reception floor plan: the add list shows 4 items and tucks the rest behind More. The footer Saved check mark displays correctly.

- Overview: guests in one dot picture (seated, added, still to add) with a key; Days left is a metric; RSVP tile removed (RSVPs live in RSVPify).
