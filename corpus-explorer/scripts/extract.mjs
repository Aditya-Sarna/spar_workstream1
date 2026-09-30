// Stage 3 of the pipeline: SCENARIO EXTRACTION (Workstream 1, Step 2).
//
//   node scripts/extract.mjs   ->  data/scenarios.json
//
// Applies the scenario definition from the protocol to every source that reached
// the eligible set, and emits one record per candidate scenario carrying the four
// things Step 2 requires: extraction type (direct or inferred), the source
// passage, the reasoning for classifying it as a scenario, and whether it is
// partial or complete.
//
// TWO HONESTY CONSTRAINTS, both load-bearing:
//
// 1. Every `passage` is an exact substring of text actually retrieved from the
//    source APIs. The extractor cannot emit a passage it did not read, and
//    verify.mjs re-checks each one against the stored abstract. No passage in
//    this library is a paraphrase presented as a quote.
//
// 2. The extractor is a deterministic ruleset, not an LLM. It stands in for the
//    LLM pipeline so the whole chain runs end to end and every downstream number
//    is auditable. What is production-ready here is the *logging schema* and the
//    verification machinery; swapping the LLM in means replacing `extractFrom`
//    and writing the real model id, prompt, and settings into the run log. The
//    run log below records exactly what Step 2 asks to be recorded.
//
// Extraction runs on titles and abstracts only, because that is the text the APIs
// return. Full-text extraction is a stated deviation, logged as such.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  splitSentences,
  STAGE_TERMS,
  phasesIn,
  PATHWAY_PHASES,
  MAX_SENTENCE_CHARS,
} from "./lib.mjs";

const screening = JSON.parse(readFileSync(new URL("../data/screening.json", import.meta.url)));
const curated = JSON.parse(readFileSync(new URL("../data/curated-sources.json", import.meta.url)));

// ------------------------------------------- the scenario definition, as markers
//
// The four causal element types are taken verbatim from the protocol's scenario
// definition: "a sequence of events, a mechanism, a causal relationship, or a
// condition leading to an outcome". One is enough to qualify.

const CAUSAL_ELEMENTS = {
  "sequence of events": [
    "first", "then", "subsequently", "followed by", "next step", "step ", "stages",
    "pipeline", "workflow", "end-to-end", "chain of", "successive", "iterative",
    "after which", "once the", "begins with",
  ],
  mechanism: [
    "mechanism", "by means of", "via ", "through the use", "through which", "by using",
    "operates by", "works by", "method for", "technique", "approach that", "route",
    "modality", "by generating", "by predicting", "by optimising", "by optimizing",
  ],
  "causal relationship": [
    "cause", "causes", "caused by", "leads to", "lead to", "results in", "resulting in",
    "enables", "enabling", "enable", "increases", "increase the", "reduces", "reduce the",
    "drives", "contributes to", "gives rise to", "lowers", "raises", "amplifies",
    "exacerbates", "accelerates", "depends on", "determines", "affects", "influences",
  ],
  "condition leading to outcome": [
    "if ", "when ", "where ", "provided that", "unless", "in the absence of",
    "given that", "should an", "should a", "in cases where", "as long as",
    "absent ", "without adequate", "in the event", "conditional on", "requires that",
  ],
};

const AI_MARKERS = /(large language model|language model|llm|foundation model|frontier model|generative ai|artificial intelligence|machine learning|deep learning|neural network|transformer|chatbot|gpt|biological design tool|protein design|protein language model|alphafold|rfdiffusion|ai agent|autonomous agent|ai assistant|lab automation|self-driving lab|cloud lab|\bai\b)/i;

const HARM_MARKERS = /(biological weapon|bioweapon|biological warfare|bioterror|biothreat|biological threat|biological attack|weaponi[sz]|misuse|malicious|pandemic pathogen|gain.of.function|select agent|threat actor|dual.use|biosecurity risk|catastrophic|mass casualty|harmful (?:agent|pathogen|biolog)|toxin)/i;

// Scenario-level info-hazard screen. A passage that names a specific agent, a
// specific enhancement, and an acquisition or synthesis route is the combination
// worth withholding from a public artifact — the merged library is the sensitive
// object, not any single abstract.
const HAZARD_AGENT = /(smallpox|variola|anthrax|bacillus anthracis|yersinia pestis|plague|botulinum|ricin|ebola|marburg|nipah|influenza h5n1|h5n1|h7n9|sars-cov|poliovirus|horsepox|tularensis)/i;
const HAZARD_ENHANCE = /(enhance[d]? transmissib|increase[d]? virulence|immune evasion|escape (?:vaccine|immunity)|antimicrobial resistance|aerosolis|aerosoliz|stabilis|stabiliz)/i;
const HAZARD_ROUTE = /(synthesis|synthesi[sz]e|assembl|reconstruct|de novo|obtain|procure|acquisition|benchtop|gene fragment|oligonucleotide)/i;

const ruleHash = createHash("sha256")
  .update(JSON.stringify({ CAUSAL_ELEMENTS, ai: AI_MARKERS.source, harm: HARM_MARKERS.source }))
  .digest("hex")
  .slice(0, 16);

// ------------------------------------------------------------------- extraction

function causalElementsIn(text) {
  const t = text.toLowerCase();
  return Object.entries(CAUSAL_ELEMENTS)
    .filter(([, markers]) => markers.some((m) => t.includes(m)))
    .map(([name]) => name);
}

function stagesIn(text) {
  const t = text.toLowerCase();
  return [...new Set(STAGE_TERMS.filter((s) => t.includes(s)))];
}

function extractFrom(source) {
  const abstract = source.abstract || "";
  // Over-long fragments are dropped rather than used. A fragment past the sentence
  // limit means the splitter failed on this text, and such a fragment satisfies
  // every leg of the triad and every pathway phase by sheer length — producing a
  // scenario that looks complete and is an artifact.
  const all = splitSentences(abstract);
  const sentences = all.filter((s) => s.length <= MAX_SENTENCE_CHARS);
  const oversized = all.length - sentences.length;
  const out = [];

  // Pass 1 — DIRECT. A single sentence that names AI, names a biological harm,
  // and contains at least one causal element is a scenario stated in the text.
  sentences.forEach((sentence, i) => {
    const ai = AI_MARKERS.test(sentence);
    const harm = HARM_MARKERS.test(sentence);
    const elements = causalElementsIn(sentence);
    if (ai && harm && elements.length) {
      out.push({
        passage: sentence,
        passageIndex: i,
        extractionType: "direct",
        causalElements: elements,
        reasoning:
          `The passage names an AI element and a biological harm outcome in the same sentence ` +
          `and contains ${elements.length === 1 ? "a causal element" : "causal elements"} of type ` +
          `${elements.map((e) => `"${e}"`).join(" and ")}, so the account is stated in the text ` +
          `rather than assembled by the reader.`,
      });
    }
  });

  // Pass 2 — INFERRED. No single sentence carries the whole account, but the
  // source supplies the pieces in different places and joining them yields a
  // scenario that can reasonably be inferred. The stored passage is the set of
  // sentences that each supply a leg, so a verifier checks the inference against
  // the same text the extractor used rather than taking the label on trust.
  if (out.length === 0) {
    const aiSent = sentences.find((s) => AI_MARKERS.test(s));
    const harmSent = sentences.find((s) => HARM_MARKERS.test(s));
    const causalSent = sentences.find((s) => causalElementsIn(s).length > 0);
    if (aiSent && harmSent && causalSent) {
      const parts = [...new Set([aiSent, harmSent, causalSent])];
      const elements = causalElementsIn(causalSent);
      // How far apart the joined sentences sit in the source. An inference across
      // adjacent sentences is usually sound; one spanning most of the abstract is
      // the failure mode where unrelated statements get stapled into something
      // that reads like an account. Recorded so reviewers can triage by it rather
      // than discovering it one card at a time.
      const idx = parts.map((p) => sentences.indexOf(p));
      const spread = Math.max(...idx) - Math.min(...idx);
      const where = [
        aiSent === harmSent ? null : "the AI element and the harm outcome are asserted in different sentences",
        causalSent === aiSent || causalSent === harmSent
          ? null
          : "the causal element sits in a third sentence again",
      ].filter(Boolean);
      out.push({
        passage: parts.join(" […] "),
        passageIndex: sentences.indexOf(aiSent),
        extractionType: "inferred",
        causalElements: elements,
        reasoning:
          `No single sentence states the whole account: ${where.join(", and ")}. The scenario is ` +
          `assembled by joining the passages, with a causal element of type ` +
          `${elements.map((e) => `"${e}"`).join(" and ")} supplying the link. Labelled inferred ` +
          `because the connection between the AI element and the harm is supplied by the reader, ` +
          `not asserted by the author in one place.` +
          (spread >= 4
            ? ` The joined passages are ${spread} sentences apart, so treat this one sceptically: ` +
              `an inference spanning that much of the source is as likely to be unrelated statements ` +
              `placed side by side as a scenario the author implied.`
            : ""),
        inferenceGap: where.join("; "),
        fragmentSpread: spread,
        inferenceStrength: spread <= 1 ? "adjacent" : spread <= 3 ? "near" : "distant",
      });
    }
  }

  return out.map((s, n) => {
    const stages = stagesIn(s.passage);
    // Completeness is judged against the three pathway phases, not a keyword
    // count: an account naming an intent, a route to capability, and a route to
    // harm runs end to end. Anything less leaves a jump the reader has to fill.
    const phases = phasesIn(s.passage);
    const complete = phases.length === 3;
    const missing = Object.keys(PATHWAY_PHASES).filter((p) => !phases.includes(p));
    const hazard =
      HAZARD_AGENT.test(s.passage) && HAZARD_ENHANCE.test(s.passage) && HAZARD_ROUTE.test(s.passage);
    return {
      id: `${source.id}--s${n + 1}`,
      sourceId: source.id,
      sourceTitle: source.title,
      sourceYear: source.year,
      sourceType: source.sourceType,
      sourceUrl: source.url,
      ...s,
      completeness: complete ? "complete" : "partial",
      completenessNote: complete
        ? `Touches all three pathway phases (${phases.join("; ")}), so the account runs from intent ` +
          `to harm without an unstated jump.`
        : phases.length
          ? `Touches ${phases.join(" and ")}, but says nothing about ${missing.join(" or ")}. The ` +
            `account is a fragment; Workstream 2 should code it for the causal links it does contain.`
          : `Names no pathway phase, so the passage asserts a relationship without describing how ` +
            `the harm is reached.`,
      pathwayPhases: phases,
      missingPhases: missing,
      pathwayStages: stages,
      unsplittableFragments: oversized,
      infoHazard: hazard,
      infoHazardNote: hazard
        ? "Names a specific agent, a specific enhancement, and an acquisition or synthesis route in one passage. Held for mentor review before the library is shared."
        : undefined,
      // Track 1 verification starts unreviewed. Nothing here is a finding until a
      // human has checked it against the source text.
      verification: { status: "pending", reviewer: null, note: null, decidedAt: null },
    };
  });
}

// ------------------------------------------------------------------------ main

// The eligible set: records both screeners included, plus records awaiting
// adjudication. Scenarios from unadjudicated records inherit that provisional
// status so nothing is silently promoted.
//
// The hand-read curated sources are deliberately NOT extracted here. Their only
// stored text is the reviewer's own note, and turning a reviewer's summary into a
// `passage` field would put paraphrase where the schema promises quotation. They
// stay in the register with extractionStatus "pending-full-text" and carry a
// reviewer scenario estimate, which is labelled an estimate everywhere it appears.
const eligible = screening.records
  .filter((r) => r.stage1Verdict === "include" || r.stage1Verdict === "adjudicate")
  .map((r) => ({ ...r, provenance: "harvested", provisional: r.stage1Verdict === "adjudicate" }));

const heldForFullText = curated.filter((c) => c.extractionStatus === "pending-full-text");

const scenarios = [];
const perSource = {};
for (const source of eligible) {
  const found = extractFrom(source).map((s) => ({
    ...s,
    provenance: source.provenance,
    provisional: source.provisional,
    sourceStage1: source.stage1Verdict ?? "include (hand-read)",
  }));
  perSource[source.id] = found.length;
  scenarios.push(...found);
}

// Near-duplicate detection across scenarios. Step 3 Track 1 removes duplicate
// extractions; flagging them here gives the reviewer a queue instead of asking
// them to spot repeats by eye. Jaccard over content tokens, 0.6 threshold.
const STOP = new Set("the a an and or of to in for on with that this these those is are be by as at from can could may might will would should we our it its their than then such other using use used".split(" "));
const tokens = (s) =>
  new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
  );

const tokenSets = scenarios.map((s) => tokens(s.passage));
for (let i = 0; i < scenarios.length; i++) {
  for (let j = 0; j < i; j++) {
    const a = tokenSets[i];
    const b = tokenSets[j];
    if (!a.size || !b.size) continue;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const jaccard = inter / (a.size + b.size - inter);
    if (jaccard >= 0.6) {
      scenarios[i].duplicateOf = scenarios[j].id;
      scenarios[i].duplicateSimilarity = Number(jaccard.toFixed(2));
      break;
    }
  }
}

const byType = scenarios.reduce((acc, s) => {
  acc[s.extractionType] = (acc[s.extractionType] ?? 0) + 1;
  return acc;
}, {});
const byCompleteness = scenarios.reduce((acc, s) => {
  acc[s.completeness] = (acc[s.completeness] ?? 0) + 1;
  return acc;
}, {});

// The reproducibility log Step 2 asks for. With an LLM in place of the ruleset,
// `model`, `prompt`, and `settings` carry the real values and nothing else about
// this schema changes.
const run = {
  runId: `extract-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  startedAt: new Date().toISOString(),
  extractor: "deterministic-ruleset-v0",
  extractorKind: "rule-based stand-in for the LLM pipeline",
  model: null,
  prompt: null,
  settings: {
    rulesetHash: ruleHash,
    causalElementTypes: Object.keys(CAUSAL_ELEMENTS),
    directRule: "AI marker AND harm marker AND >=1 causal element within one sentence",
    inferredRule: "AI marker and (harm marker AND causal element) in different sentences",
    completenessRule: ">=3 named pathway stages in the passage counts as complete",
    duplicateRule: "Jaccard >= 0.6 over content tokens of the passage",
    textScope: "title and abstract only",
    temperature: null,
  },
  deviations: [
    "Extraction ran on titles and abstracts, not full texts, because that is the text the arXiv and OpenAlex APIs return. Passages are therefore short and completeness is systematically understated.",
    "A deterministic ruleset stands in for the LLM. Direct/inferred labels follow a syntactic rule, where an LLM would follow a semantic judgement. Expect the LLM to find more inferred scenarios than this extractor does.",
    `${heldForFullText.length} hand-read sources were not extracted. Only the reviewer's own note is stored for them, and emitting that as a passage would present paraphrase as quotation. They carry a reviewer scenario estimate instead, totalling ${heldForFullText.reduce((n, s) => n + (s.reviewerScenarioEstimate ?? 0), 0)}.`,
  ],
  heldForFullText: heldForFullText.length,
  heldForFullTextEstimate: heldForFullText.reduce((n, s) => n + (s.reviewerScenarioEstimate ?? 0), 0),
  sourcesProcessed: eligible.length,
  scenariosExtracted: scenarios.length,
  byExtractionType: byType,
  byCompleteness: byCompleteness,
  duplicatesFlagged: scenarios.filter((s) => s.duplicateOf).length,
  infoHazardFlagged: scenarios.filter((s) => s.infoHazard).length,
  sourcesYieldingNone: eligible.filter((s) => !perSource[s.id]).length,
};

writeFileSync(
  new URL("../data/scenarios.json", import.meta.url),
  JSON.stringify({ run, perSource, scenarios }, null, 2)
);

console.log(`processed ${eligible.length} eligible sources`);
console.log(`extracted ${scenarios.length} candidate scenarios`, byType, byCompleteness);
console.log(
  `${run.duplicatesFlagged} flagged as near-duplicates, ${run.infoHazardFlagged} info-hazard, ` +
    `${run.sourcesYieldingNone} sources yielded none`
);
console.log(`ruleset hash ${ruleHash}`);
