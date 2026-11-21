# Betel & Carter — Wedding Atelier

Planning site for Betel & Carter's wedding · **Thursday, June 17, 2027 · Morais Vineyards & Winery, Bealeton VA**.
Styled from Betel's "Wedding day" Pinterest board: deep moss, ivory paper, wine, antique gold, scalloped frames, wax seals, a tibeb border.

## Pages

| Tab | What it does |
|---|---|
| Overview | Photo, countdown, progress, milestones spaced by real time, team at a glance |
| The Team | One card per person: their roles + status, link tiles, an updates feed. Add people or roles |
| Seating | Approximate Morais ballroom (80 × 50 ft, ~4,000 sq ft). "Suggest a seating chart" lays out tables for your guest count; "Auto-seat" fills them. Round + rectangle tables (seats per side), inspo photos you can drag around |
| Guests | Betel, Carter and the whole team are added automatically. Address, email, phone, meal, plus-one, notes. **Export CSV** for invitations |
| Mood | Four palettes read from the board; the chosen one colors the seating plan |

**Overview photo:** save a photo as `assets/hero.jpg`.
**Venue size:** the ballroom has no public floor plan. Ask Morais for theirs, then update Width/Length on the Seating tab.

## Run it locally

```powershell
cd C:\Users\raabk\Documents\GitHub\betel-wedding
python -m http.server 5173
```

Open http://localhost:5173. (Opening `index.html` by double-click does not work — browsers block JS modules from `file://`.)

## How saving works (read this before sharing)

- Edits save in **that person's browser only**.
- To share: click **Export** → send the `.json` file → the other person clicks **Import**.
- Importing **replaces** what they had. One person should be the "keeper" of the latest file.
- Live shared editing (everyone sees changes instantly) needs a small database — not set up yet.

## Put it online (pick one)

### GitHub Pages (free, ~5 minutes)

1. Create a new repo on github.com called `betel-wedding` (public).
2. In this folder:
   ```powershell
   git init
   git add .
   git commit -m "Betel & Carter wedding atelier"
   git branch -M main
   git remote add origin https://github.com/<your-username>/betel-wedding.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. Site appears at `https://<your-username>.github.io/betel-wedding/` in ~1 minute.

### Vercel (free, ~3 minutes)

1. Push to GitHub (steps 1–2 above).
2. vercel.com → **Add New → Project** → import `betel-wedding` → Framework preset: **Other** → Deploy.

## Editing the content

Seed data lives in `js/data.js` — roles, to-dos, milestones, palettes, starting tables, room size.
Changing `data.js` only affects people who haven't saved anything yet (or who click **Start fresh**).
