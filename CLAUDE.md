# Betel & Carter wedding site

Static site (vanilla JS), GitHub Pages from `main`. Project skills live in `.claude/skills/` (start with betel-agents).

## Dev board: update it after EVERY ticket (owner rule, Nov 23 2026)
The dev board (`../wedding-dev-board`, `node board.mjs ...`) is how Kiara knows the current status of the site. When a ticket is finished, update the board right away (not at the end of a batch):
- `node board.mjs note <id> "what changed, how it was tested, what is NOT verified"` then `node board.mjs done <id> "<commit or merge sha>"`.
- New bug or idea found along the way: `node board.mjs add ...` with repeatable steps for bugs.
- Work started but not finished: leave a `note` saying where it stands. Never leave a ticket "backlog" after it shipped.
- Also keep `RELEASE-NOTES.md` current when a batch ships (see the betel-ship skill).

## Read first, write back
- `docs/WIKI.md`: how the site works (code map, state, seating rules, CSS gotchas, testing). Read it before changing a feature.
- `docs/DECISIONS.md`: every product decision and why. When you make or learn a decision, add a row. Do not contradict a logged decision without the owner's say.
- Public repo: no private details in any file (emails, personal notes, keys).
