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

## v2026.11.23-b  (Nov 23, afternoon)
**Planning for 100 guests**
- Default expected guests is 100. At 100, only "Family rows" fits the ballroom (rounds top out at 76 to 88 seats), so Suggest now explains and switches to a style that seats everyone. Ceremony and Hangout spot fit 100; the Tasting room fits only 4 of the 10 high-tops needed. The ballroom size is still an estimate until Morais sends the real plan.
- Guests table on desktop is a Notion-style grid: light grey header, thin borders, cells edited in place, sticky header, compact rows.
- Satellite map opens close in on the buildings (zoom 18) and fits the phone.

**Feedback box**
- Bell > Send feedback (Request or Something broke). Saved to Firestore, with an offline queue. Owner exports from the Live panel (Feedback); `wedding-dev-board/feedback-to-board.mjs` turns the export into tickets. Skill: `betel-feedback`.
- The `feedback` Firestore rule was published by the owner on Nov 23 (see `FIRESTORE-RULES.txt`). Not yet verified with a real send from a signed-in browser.

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
