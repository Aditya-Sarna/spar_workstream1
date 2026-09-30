// Shared utilities for the pipeline scripts. Kept in its own module so importing a
// helper does not re-run another script's main body.

/**
 * Split prose into sentences, discarding fragments too short to be a passage.
 *
 * The second pattern matters more than it looks. Abstracts reconstructed from
 * OpenAlex inverted indices, and documents carrying footnote markers, routinely
 * run sentences together with no space after the full stop — "national
 * security.The ways that". Splitting only on whitespace leaves the entire abstract
 * as one "sentence", which then satisfies every leg of the triad and every pathway
 * phase trivially, and a spurious complete scenario comes out the other end.
 */
export const splitSentences = (text) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z("])|(?<=[a-z0-9)\]])\.(?=[A-Z])/)
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 25);

/**
 * The longest a single sentence is plausibly allowed to be. Anything past this is
 * a splitting failure rather than a sentence, and a passage that long is not a
 * quotable account — it is most of a paper.
 */
export const MAX_SENTENCE_CHARS = 600;

/**
 * Does the text have a biological anchor at all?
 *
 * Defined once and shared, because screening and verification asking this question
 * differently is how a corpus drifts. Stems are anchored at a word boundary and
 * short tokens are whole words, which matters more than it sounds: an unanchored
 * `rna` matches "exte(rna)l", "gove(rna)nce" and "alte(rna)tive", so the earlier
 * version of this test passed on ordinary English and the out-of-scope-harm
 * exclusion barely fired.
 *
 * Bare `agent` is excluded for the same reason at the word level rather than the
 * substring level: "AI agent", "autonomous agent" and "cyber agents" are the
 * dominant senses in this corpus, so treating the word as biological anchored a
 * cyber-defence paper and an AI-insurance paper into the included set. The
 * biological senses are kept as phrases.
 */
export const BIO_ANCHOR = new RegExp(
  "\\b(?:biolog|pathogen|virus|viral|bacteri|toxin|genom|genetic|protein|pandemic|epidemic|" +
    "vaccine|biosecur|biosaf|microb|anthrax|smallpox|influenza|bioweapon|biotech|" +
    "synthetic biolog|life scien|nucleic acid|oligonucleotid)|" +
    "\\b(?:biological|select|pathogenic|infectious)\\s+agents?\\b|" +
    "\\b(?:dna|rna|gene|genes)\\b",
  "i"
);

/**
 * The misuse pathway, in three phases. Completeness of a scenario is judged
 * against these rather than against a count of keywords: an account that names
 * an intent, a route to capability, and a route to harm runs end to end, whereas
 * one that names a subset leaves an unstated jump.
 */
export const PATHWAY_PHASES = {
  // "actor" is deliberately not in this list as a bare substring: it matches
  // "factor", "refactor" and "contractor", which fire on almost any methods text.
  "intent / ideation": [
    "intent", "ideation", "planning", "plan to", "seeks to", "motivat",
    "threat actor", "malicious actor", "state actor", "bad actor", "actors",
    "adversar", "terror", "attacker", "state programme", "state program",
    "target selection", "agent selection", "select an agent", "deliberate",
  ],
  "capability / acquisition": [
    "acquisition", "acquire", "obtain", "procure", "synthesis", "synthesise", "synthesize",
    "design", "engineer", "modif", "construct", "assembl", "produce", "production",
    "culture", "scale-up", "scale up", "purif", "protocol", "benchtop", "gene fragment",
    "oligonucleotide", "reconstruct", "de novo", "troubleshoot", "laboratory",
  ],
  "release / harm": [
    "release", "dissemination", "disseminate", "delivery", "deliver", "aerosol",
    "outbreak", "epidemic", "pandemic", "infect", "casualt", "fatalit", "death",
    "mortality", "harm", "damage", "attack", "exposure", "spread", "transmission",
  ],
};

export const phasesIn = (text) => {
  const t = text.toLowerCase();
  return Object.entries(PATHWAY_PHASES)
    .filter(([, markers]) => markers.some((m) => t.includes(m)))
    .map(([name]) => name);
};

/** Named stages, kept for the graded stage-coverage facet. */
export const STAGE_TERMS = [
  "ideation", "planning", "acquisition", "acquire", "synthesis", "synthesise", "synthesize",
  "production", "scale-up", "formulation", "dissemination", "release", "delivery", "weaponi",
];

/** Cohen's kappa for two raters on a binary decision over the same record set. */
export function cohensKappa(a, b) {
  const n = a.length;
  let both = 0, onlyA = 0, onlyB = 0, neither = 0;
  for (let i = 0; i < n; i++) {
    const ia = a[i] === "include";
    const ib = b[i] === "include";
    if (ia && ib) both++;
    else if (ia) onlyA++;
    else if (ib) onlyB++;
    else neither++;
  }
  const po = (both + neither) / n;
  const pe =
    ((both + onlyA) * (both + onlyB) + (onlyB + neither) * (onlyA + neither)) / (n * n);
  return {
    n, both, onlyA, onlyB, neither,
    observedAgreement: po,
    expectedAgreement: pe,
    kappa: pe === 1 ? 1 : (po - pe) / (1 - pe),
  };
}

/** Landis & Koch (1977) benchmarks, the convention this literature cites. */
export const kappaBand = (k) =>
  k < 0 ? "poor" : k < 0.21 ? "slight" : k < 0.41 ? "fair" : k < 0.61 ? "moderate" : k < 0.81 ? "substantial" : "almost perfect";

/** Deterministic seeded RNG, so the Track 2 sample is reproducible from its seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
