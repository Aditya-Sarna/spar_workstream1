// The protocol's eligibility instrument, as data. Kept apart from lib/queries.ts
// because that module opens SQLite and cannot be imported into a client component.
// Source of truth: docs/IMPLEMENTATION.md

export const SCENARIO_DEFINITION =
  "A coherent account of a possible situation or sequence of events in which AI-enabled " +
  "biological misuse could emerge, unfold, or persist, containing at least one causal element " +
  "such as a sequence of events, a mechanism, a causal relationship, or a condition leading to " +
  "an outcome.";

export const CAUSAL_ELEMENT_TYPES = [
  "sequence of events",
  "mechanism",
  "causal relationship",
  "condition leading to outcome",
];

export const PATHWAY_PHASE_NAMES = [
  "intent / ideation",
  "capability / acquisition",
  "release / harm",
];

export const TRIAD = [
  {
    leg: "AI element",
    test: "Does the source name a model, system, tool, or automated capability?",
  },
  {
    leg: "Biological harm outcome",
    test:
      "Does the source name a biological harm, whether realised, attempted, or hypothesised? " +
      "A harm word that does not say what kind of harm (misuse, malicious, catastrophic, dual-use) " +
      "satisfies this leg only alongside biological vocabulary in the same scope. Otherwise the harm " +
      "is out of scope rather than absent.",
  },
  {
    leg: "Connective",
    test: "Does the source supply a mechanism, sequence, causal claim, or condition linking the two?",
  },
];

export const EXCLUSION_CODES: Record<string, { label: string; text: string }> = {
  E1: {
    label: "Capability paper",
    text: "AI and a connective are present. No biological harm outcome is named.",
  },
  E2: {
    label: "Conventional biosecurity",
    text: "A biological harm and a connective are present. No AI element is named.",
  },
  E3: {
    label: "Assertion, not a pathway",
    text: "AI and biological harm are both named. Nothing connects them.",
  },
  E4: {
    label: "Residual",
    text: "At most one triad leg is present, so a single-leg code does not apply.",
  },
  E5: {
    label: "Out-of-scope harm",
    text: "AI and a connective are present. The only harm named is not biological.",
  },
  E6: {
    label: "Not a source",
    text: "Editorial, news item, blog post, or press release carrying no argument of its own. Applied at full text.",
  },
  E7: {
    label: "Inaccessible",
    text: "Full text unobtainable, so the pathway cannot be verified against the source. Applied at full text.",
  },
  E8: {
    label: "Out of window",
    text: "Published before 2017. Harvest already filtered this; the count in the 395 is zero.",
  },
  E9: {
    label: "Duplicate",
    text: "The same document reached the corpus twice. Removed at identification, not counted again as an exclusion.",
  },
};

export const TITLE_ABSTRACT_INCLUSION = [
  { id: "I1", text: "Names an AI element: a model, system, tool, or automated capability." },
  {
    id: "I2",
    text:
      "Names a biological harm outcome, whether realised, attempted, or hypothesised. " +
      "A generic harm word (misuse, malicious, catastrophic, dual-use) satisfies this only " +
      "alongside biological vocabulary in the same scope.",
  },
  { id: "I3", text: "Supplies a connective: a mechanism, sequence, causal claim, or condition linking the two." },
  { id: "I4", text: "Is a publicly available source of any type, in English, published 2017 onward." },
  { id: "I5", text: "Carries its own argument rather than only reporting another source's." },
];

export const FULL_TEXT_INCLUSION = [
  {
    id: "I6",
    text:
      "Full text is in hand, so every extracted pathway can be checked against it. " +
      "Not yet applied to the 17 database records in the working corpus.",
  },
];

/** @deprecated Use TITLE_ABSTRACT_INCLUSION and FULL_TEXT_INCLUSION. Kept for older imports. */
export const INCLUSION_CRITERIA = [...TITLE_ABSTRACT_INCLUSION, ...FULL_TEXT_INCLUSION];

export const NEVER_EXCLUDE_ON = [
  "The source concluding the AI provides no uplift. A negative finding about a pathway is evidence about that pathway.",
  "The pathway being speculative, unquantified, or unevidenced. Evidence status is recorded, never gating.",
  "The AI's role being marginal rather than load-bearing. Degree is metadata.",
  "The pathway being incomplete. Partial accounts are coded for the fragments they contain.",
  "No actor being named. Many sources describe a pathway without specifying who walks it.",
];

export const VERIFICATION_STATUSES: Record<string, string> = {
  supported: "Checked against the source text and the definition; the account holds.",
  unsupported: "Not supported by the source text, or fails the definition. Removed from the library.",
  duplicate: "The same account as another extraction. Removed, with the retained scenario named.",
  unclear: "Reviewed but not resolvable without the full text or a second opinion.",
};
