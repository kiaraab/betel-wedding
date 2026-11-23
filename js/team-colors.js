// Team card colours: one source of truth for the Team page (card fill), the ceremony floor plan (party dots) and the 3D figures' dresses.
// Bridesmaids' cards are filled with their colour; anyone else is a plain cream card ('none').
export const TEAM_COLORS = { none: 'Default', pink: 'Pink', burgundy: 'Burgundy', green: 'Green', cream: 'Cream', rose: 'Rose', sage: 'Sage', plum: 'Plum', sand: 'Sand' };
export const COLOR_OF = { kiara: 'pink', monica: 'pink', ashlyn: 'burgundy', eden: 'burgundy', noella: 'burgundy', noemi: 'green', morgan: 'green', isabele: 'green' };
/** The solid colour of each card colour (as drawn on the Team page, styles.css .tcard.c-*). 'none' has no colour: callers keep their own default. */
export const HEX = { pink: '#ecc6c8', burgundy: '#8a2638', green: '#627848', cream: '#f6efe3', rose: '#d9959b', sage: '#c4cdae', plum: '#4a2a3c', sand: '#dccdb4' };
export const colorOf = (p) => p.color || COLOR_OF[p.id] || 'none';
/** The dress colour for a team person id (looked up in state.people), or null when they have none / are not on the team. */
export const hexOfPerson = (people, id) => { const p = (people || []).find((x) => x.id === id); return p ? HEX[colorOf(p)] || null : null; };
