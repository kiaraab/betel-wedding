// A small wink for the couple: example names in the Add boxes are characters from Veep, Bridgerton and the Spider-Man universe, different each time.
const VEEP = ['Selina Meyer', 'Gary Walsh', 'Amy Brookheimer', 'Dan Egan', 'Jonah Ryan', 'Mike McLintock', 'Kent Davison', 'Catherine Meyer', 'Richard Splett', 'Sue Wilson', 'Tom James', 'Ben Cafferty'];
const BRIDGERTON = ['Daphne Bridgerton', 'Simon Basset', 'Penelope Featherington', 'Colin Bridgerton', 'Eloise Bridgerton', 'Anthony Bridgerton', 'Kate Sharma', 'Lady Danbury', 'Violet Bridgerton', 'Benedict Bridgerton', 'Francesca Bridgerton', 'Queen Charlotte'];
const SPIDER = ['Peter Parker', 'Miles Morales', 'Gwen Stacy', 'Mary Jane Watson', 'Aunt May', 'Ned Leeds', 'Harry Osborn', 'Eddie Brock', 'Miguel O’Hara', 'Jessica Drew', 'Pavitr Prabhakar', 'Cindy Moon', 'Betty Brant', 'Flash Thompson', 'Michelle Jones', 'Otto Octavius'];
const ALL = [...VEEP, ...BRIDGERTON, ...SPIDER];
const pick = (list, not = []) => { const l = list.filter((x) => !not.includes(x)); return l[Math.floor(Math.random() * l.length)]; };
const COUPLES = ['Daphne & Simon Basset', 'Penelope & Colin Bridgerton', 'Kate & Anthony Bridgerton', 'Peter & MJ Parker', 'Aunt May & Ben Parker', 'Mike & Wendy McLintock', 'Selina & Andrew Meyer'];

/** One random name, e.g. for the "Name" box. */
export const exampleName = () => pick(ALL);

/** The hint inside the paste box: three different formats with fresh names. */
export function pasteHint() {
  const a = pick(COUPLES), b = pick(ALL), c = pick(ALL, [b]);
  return `Paste names, one per line or with commas.  “${a} (Carter)”, “${b}, bridesmaid”, “${c} + 1”`;
}
