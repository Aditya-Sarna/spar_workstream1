// Stage 2 of the pipeline: TITLE/ABSTRACT SCREENING BY TWO INDEPENDENT SCREENERS.
//
//   node scripts/screen.mjs   ->  data/screening.json
//
// The protocol requires two reviewers to screen every record independently, with
// agreement quantified and disagreements adjudicated. Two automated screeners
// stand in for the two humans at pass 1. They are not a threshold apart — they
// operationalise the triad differently, which is the point:
//
//   Screener A  document-level co-occurrence. The source counts as asserting a
//               connection if an AI term, a harm term, and a connective appear
//               anywhere in the title or abstract.
//   Screener B  sentence-level co-occurrence. The connection must be asserted
//               inside a single sentence, so a paper that mentions AI in its
//               opening line and bioweapons in its closing line does not pass.
//
// Cohen's kappa between them therefore measures something real: how much the
// eligibility verdict depends on reading the triad loosely or tightly. That is a
// finding about the instrument, not a bug. Records where they disagree are the
// adjudication queue — the records a human must actually read.

import { readFileSync, writeFileSync } from "node:fs";
import { splitSentences, STAGE_TERMS, cohensKappa, kappaBand, BIO_ANCHOR } from "./lib.mjs";

const src = JSON.parse(readFileSync(new URL("../data/records.json", import.meta.url)));

// ---------------------------------------------------------------- vocabularies

const AI_TERMS = [
  "large language model", "language model", "llm", "foundation model", "frontier model",
  "generative ai", "artificial intelligence", "machine learning", "deep learning",
  "neural network", "transformer", "chatbot", "gpt", "reasoning model",
  "biological design tool", "protein design", "protein language model", "alphafold",
  "rfdiffusion", "diffusion model", "biological foundation model",
  "ai agent", "autonomous agent", "ai assistant", "lab automation", "self-driving lab",
  "cloud lab", "sequence model", "generative model", " ai ",
];

// Harm terms in two tiers, because an untiered list is what let non-biological
// papers through. An AI-insurance report and a cyber-defence paper both say
// "catastrophic", "malicious", "misuse" and "dual-use" while asserting nothing
// about biology, and when those words alone satisfy the harm leg the triad stops
// testing what it claims to test.
//
// Tier 1 names a biological harm outcome on its own.
const BIO_HARM_TERMS = [
  "biological weapon", "bioweapon", "biological warfare", "bioterror", "biothreat",
  "biological threat", "biological attack", "biological misuse", "biosecurity risk",
  "pandemic pathogen", "gain-of-function", "gain of function", "select agent",
  "mass casualty", "biological agent",
];

// Tier 2 names a harm without saying what kind. These count only when a
// biological anchor is present in the same scope the screener is reading.
const GENERIC_HARM_TERMS = [
  "misuse", "malicious", "catastrophic", "dual-use", "dual use", "threat actor",
  "weaponisation", "weaponization", "weaponise", "weaponize",
];

// Phrases that assert a causal link. Generic conjunctions are deliberately
// excluded: "if", "because" and "thereby" fire on nearly every abstract, which
// makes the connective leg vacuous.
const CONNECTIVE_TERMS = [
  "enable", "enabling", "enabled", "lower the barrier", "lower barriers",
  "lowering barriers", "barrier to entry", "uplift", "facilitate", "facilitating",
  "could allow", "leads to", "lead to", "pathway", "risk chain", "kill chain",
  "scenario", "increase the risk", "increases risk", "increase risk", "accelerate",
  "accelerating", "assist", "assisting", "make it easier", "easier to",
  "remove barriers", "democratize", "democratise", "contribute to", "exacerbate",
  "amplify", "raise the ceiling", "ceiling of harm", "circumvent", "evade",
  "bypass", "expand the capabilities", "give rise to", "result in", "mechanism",
];

// Imported rather than redefined: see the note on BIO_ANCHOR in lib.mjs for why an
// unanchored version of this test silently passed on ordinary English.

const hits = (text, terms) => terms.filter((t) => text.includes(t));

/**
 * Resolve the harm leg inside one scope — a single sentence for Screener B, the
 * whole title and abstract for Screener A.
 *
 * A tier-2 term with no biological anchor in scope is treated as an out-of-scope
 * harm claim rather than an absent one. That distinction is what separates a paper
 * asserting a harm this review does not cover from a paper asserting no harm at
 * all, and the two carry different exclusion codes.
 */
function harmIn(text) {
  const direct = hits(text, BIO_HARM_TERMS);
  const generic = hits(text, GENERIC_HARM_TERMS);
  const anchored = BIO_ANCHOR.test(text);
  return {
    terms: direct.length ? direct : generic,
    present: direct.length > 0 || (generic.length > 0 && anchored),
    outOfScope: direct.length === 0 && generic.length > 0 && !anchored,
  };
}

// ------------------------------------------------------------------- screeners

/**
 * Assign an exclusion code from which leg of the triad failed. The out-of-scope
 * test is read at document level for both screeners, because "is this paper about
 * biological harm at all" is a question about the paper rather than about the
 * sentence a screener happened to match. Only the in/out decision differs by
 * scope, which keeps the two screeners a clean comparison.
 */
function codeFor({ ai, harm, connective }, outOfScope) {
  if (ai && harm && connective) return null;
  if (ai && connective && outOfScope) return ["E5", "Out-of-scope harm"];
  if (ai && connective && !harm) return ["E1", "Capability paper, no harm outcome"];
  if (harm && connective && !ai) return ["E2", "Conventional biosecurity, no AI"];
  if (ai && harm && !connective) return ["E3", "Assertion, not a pathway"];
  return ["E4", "Residual"];
}

/** Screener A: the triad legs may be satisfied anywhere in title + abstract. */
function screenerA(rec, docHarm) {
  const text = `${rec.title} ${rec.abstract}`.toLowerCase();
  const ai = hits(text, AI_TERMS);
  const conn = hits(text, CONNECTIVE_TERMS);
  const triad = { ai: ai.length > 0, harm: docHarm.present, connective: conn.length > 0 };
  const code = codeFor(triad, docHarm.outOfScope);
  return {
    screener: "A",
    basis: "document-level co-occurrence",
    triad,
    verdict: code ? "exclude" : "include",
    exclusionCode: code?.[0],
    exclusionReason: code?.[1],
    matched: {
      ai: ai.slice(0, 4),
      harm: docHarm.terms.slice(0, 4),
      connective: conn.slice(0, 4),
    },
  };
}

/** Screener B: all three legs must be satisfied within one sentence. */
function screenerB(rec, docHarm) {
  const sentences = splitSentences(`${rec.title}. ${rec.abstract}`);
  let best = null;
  for (const s of sentences) {
    const t = s.toLowerCase();
    const ai = hits(t, AI_TERMS);
    // Resolved per sentence, so a generic harm word only counts when the sentence
    // itself is about biology.
    const harm = harmIn(t);
    const conn = hits(t, CONNECTIVE_TERMS);
    const score = (ai.length > 0) + harm.present + (conn.length > 0);
    if (!best || score > best.score) best = { score, s, ai, harm, conn };
    if (score === 3) break;
  }
  const triad = best
    ? { ai: best.ai.length > 0, harm: best.harm.present, connective: best.conn.length > 0 }
    : { ai: false, harm: false, connective: false };
  const code = codeFor(triad, docHarm.outOfScope);
  return {
    screener: "B",
    basis: "sentence-level co-occurrence",
    triad,
    verdict: code ? "exclude" : "include",
    exclusionCode: code?.[0],
    exclusionReason: code?.[1],
    sentence: best && triad.ai && triad.harm && triad.connective ? best.s : undefined,
    matched: best
      ? {
          ai: best.ai.slice(0, 4),
          harm: best.harm.terms.slice(0, 4),
          connective: best.conn.slice(0, 4),
        }
      : { ai: [], harm: [], connective: [] },
  };
}

// -------------------------------------------------------- graded metadata (not gating)

const MECH_LOWER = ["lower the barrier", "lower barriers", "lowering barriers", "barrier to entry", "democratize", "democratise", "accessib", "non-expert", "nonexpert", "novice", "easier to", "less expertise", "reduce the expertise"];
const MECH_ACCESS = ["access to information", "retrieve", "protocol", "troubleshoot", "instructions", "synthesis provider", "acquisition", "obtain", "procure"];
const MECH_CEILING = ["ceiling of harm", "raise the ceiling", "de novo", "enhanced", "more transmissible", "more virulent", "immune evasion", "evade detection", "circumvent", "expand the capabilities"];
const EV_EMPIRICAL = ["we conducted", "participants", "we evaluate", "experiment", "trial", "our results show", "we find that", "benchmark", "we measured", "randomi"];
const EV_REDTEAM = ["red team", "red-team", "uplift study", "jailbreak", "adversarial testing", "capability evaluation", "we tested"];
const INTENT_ACCIDENT = ["accident", "inadvertent", "unintentional", "laboratory leak", "lab leak", "biosafety incident"];
const INTENT_RECKLESS = ["reckless", "negligen", "irresponsib"];
const INTENT_DELIBERATE = ["malicious", "deliberate", "intentional", "terror", "threat actor", "adversar", "attacker", "weaponi"];

function grade(rec) {
  const text = `${rec.title} ${rec.abstract}`.toLowerCase();
  const mechanisms = [];
  if (hits(text, MECH_LOWER).length) mechanisms.push("lowers barrier");
  if (hits(text, MECH_ACCESS).length) mechanisms.push("increases access");
  if (hits(text, MECH_CEILING).length) mechanisms.push("raises ceiling of harm");
  if (!mechanisms.length) mechanisms.push("none claimed");

  const aiClass = [];
  if (/large language model|language model|llm|chatbot|gpt|foundation model|frontier model/.test(text)) aiClass.push("LLM");
  if (/protein design|biological design tool|rfdiffusion|alphafold|protein structure/.test(text)) aiClass.push("Biological design tool");
  if (/biological foundation model|genomic language model|sequence model|protein language model/.test(text)) aiClass.push("Bio foundation model");
  if (/agent|autonomous|lab automation|self-driving lab|cloud lab|robotic/.test(text)) aiClass.push("Agent / lab automation");
  if (!aiClass.length) aiClass.push("unspecified");

  const stages = [...new Set(hits(text, STAGE_TERMS))];

  return {
    mechanisms,
    aiClass,
    stages,
    aiRole: /enabl|make possible|remove barriers|democrati/.test(text)
      ? "load-bearing"
      : /assist|help|support|facilitat|accelerat/.test(text)
        ? "assisting"
        : "present",
    evidence: hits(text, EV_REDTEAM).length
      ? "red-team or uplift evidence"
      : hits(text, EV_EMPIRICAL).length
        ? "empirical result"
        : "asserted only",
    intent: hits(text, INTENT_ACCIDENT).length
      ? "accidental"
      : hits(text, INTENT_RECKLESS).length
        ? "reckless"
        : hits(text, INTENT_DELIBERATE).length
          ? "deliberate"
          : "unspecified",
  };
}

// ----------------------------------------------------------------------- kappa

// ------------------------------------------------------------------------ main

const screened = src.records.map((rec) => {
  const docHarm = harmIn(`${rec.title} ${rec.abstract}`.toLowerCase());
  const a = screenerA(rec, docHarm);
  const b = screenerB(rec, docHarm);
  const agree = a.verdict === b.verdict;
  return {
    ...rec,
    grade: grade(rec),
    screenA: a,
    screenB: b,
    agree,
    // Where the two screeners disagree the record cannot be resolved without a
    // human reading it, so it enters the adjudication queue rather than silently
    // taking either verdict.
    stage1Verdict: agree ? a.verdict : "adjudicate",
    exclusionCode: agree ? a.exclusionCode : undefined,
    exclusionReason: agree ? a.exclusionReason : undefined,
  };
});

const kappa = cohensKappa(
  screened.map((r) => r.screenA.verdict),
  screened.map((r) => r.screenB.verdict)
);

// Agreement on the *reason*, among records both screeners excluded. Two reviewers
// agreeing a record is out but disagreeing why is a codebook problem, not a
// screening problem, and is worth reporting separately.
const bothExcluded = screened.filter(
  (r) => r.screenA.verdict === "exclude" && r.screenB.verdict === "exclude"
);
const reasonAgreement =
  bothExcluded.length === 0
    ? null
    : bothExcluded.filter((r) => r.screenA.exclusionCode === r.screenB.exclusionCode).length /
      bothExcluded.length;

const counts = screened.reduce((acc, r) => {
  acc[r.stage1Verdict] = (acc[r.stage1Verdict] ?? 0) + 1;
  return acc;
}, {});

writeFileSync(
  new URL("../data/screening.json", import.meta.url),
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      retrieval: {
        identified: src.identified,
        perDatabase: src.perDatabase,
        perQuery: src.perQuery,
        duplicatesByDoi: src.duplicatesByDoi,
        duplicatesByTitle: src.duplicatesByTitle,
        failures: src.failures,
      },
      kappa,
      kappaBand: kappaBand(kappa.kappa),
      reasonAgreement,
      reasonAgreementDenominator: bothExcluded.length,
      counts,
      records: screened,
    },
    null,
    2
  )
);

console.log(`screened ${screened.length} records by two machine readings of the triad`);
console.log("stage-1 outcome:", counts);
console.log(
  `kappa ${kappa.kappa.toFixed(3)} (${kappaBand(kappa.kappa)}); observed agreement ${(kappa.observedAgreement * 100).toFixed(1)}%`
);
console.log(
  `both include ${kappa.both}, A only ${kappa.onlyA}, B only ${kappa.onlyB}, both exclude ${kappa.neither}`
);
if (reasonAgreement !== null)
  console.log(
    `exclusion-reason agreement ${(reasonAgreement * 100).toFixed(1)}% of ${bothExcluded.length} jointly excluded`
  );
