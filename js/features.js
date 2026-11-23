// Feature flags for parts of the UI that are switched off on purpose (REQ-165).
// RSVPs live in RSVPify and addresses are collected elsewhere, so this site hides both.
// Saved data (g.rsvp, g.street, g.city ...) is never touched: set a flag to true to bring that UI back.
// Counts that already treat a saved rsvp of 'Declined' as "not going" keep doing so either way.
export const FEATURES = { rsvp: false, address: false };
