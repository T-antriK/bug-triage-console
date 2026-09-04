/**
 * WHAT THIS DOES
 * Produces a lowercase, punctuation-tamed copy of the report text that
 * every keyword table matches against. The original text is never
 * modified — evidence spans are located in the original so what the
 * reviewer sees is exactly what was submitted.
 *
 * HOW TO CHANGE IT
 * If a class of reports keeps missing a keyword because of typography
 * (curly quotes, unusual dashes, non-breaking spaces), add a replace()
 * line below. Keep it to character-level clean-up only. Never drop or
 * reorder words here — matching logic belongs in the other rules files.
 *
 * WHY IT WORKS THIS WAY
 * Matching on a normalized copy keeps every keyword array in the repo
 * simple lowercase ASCII. Keeping the original untouched is what makes
 * the evidence spans trustworthy: "verbatim" has to mean verbatim.
 */

export type Normalized = {
  original: string;
  lower: string;
};

export function normalize(text: string): Normalized {
  const lower = text
    .toLowerCase()
    .replace(/[‘’ʼ′]/g, "'") // curly / modifier apostrophes -> '
    .replace(/[“”]/g, '"') // curly double quotes -> "
    .replace(/[–—−]/g, '-') // en / em dash, minus -> -
    .replace(/ /g, ' ') // non-breaking space -> space
    .replace(/\s+/g, ' ')
    .trim();

  return { original: text, lower };
}

/** True when every keyword in the list appears somewhere in the normalized text. */
export function hasAll(lower: string, keywords: readonly string[]): boolean {
  return keywords.every((k) => lower.includes(k));
}

/** The subset of keywords that appear in the normalized text (presence, not count). */
export function matched(lower: string, keywords: readonly string[]): string[] {
  return keywords.filter((k) => lower.includes(k));
}

/** True when at least one keyword appears. */
export function hasAny(lower: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => lower.includes(k));
}
