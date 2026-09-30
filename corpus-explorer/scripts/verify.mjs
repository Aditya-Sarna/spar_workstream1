// Stage 4 of the pipeline: TWO-TRACK VERIFICATION (Workstream 1, Step 3).
//
//   node scripts/verify.mjs   ->  data/verification.json
//
// TRACK 1 — every extracted scenario checked against the source text and the
// scenario definition, with unsupported and duplicate extractions removed.
//
//   Part of this is machine-checkable and is checked here: is the stored passage
//   actually present in the retrieved text, and does the scenario satisfy the
//   definition's stated requirements (an AI-enabled biological misuse account
//   carrying at least one causal element)? A passage that is not a verbatim
//   substring of the abstract fails integrity, which is the check that stops
//   paraphrase entering the library as quotation.
//
//   The remaining part — is this a coherent account, or did the extractor staple
//   two unrelated clauses together — is a human judgement. It is left as an open
//   queue with a persisted decision slot, not silently auto-passed.
//
// TRACK 2 — a random subset of sources coded independently from scratch, blind to
// the first pass, then compared to characterise coverage rather than to build a
// gold standard.
//
//   A second coder with a deliberately different ruleset stands in for the blind
//   human coder. It is not a variant of coder 1: it reads at paragraph level and
//   uses the source's overall subject to supply the AI element, the way a human
//   coding from scratch uses the paper's context instead of sentence-local cues.
//   Coverage is then computed the same way it will be for the human track, so
//   swapping humans in changes the inputs and nothing else.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { splitSentences, phasesIn, mulberry32, MAX_SENTENCE_CHARS, BIO_ANCHOR } from "./lib.mjs";

// An inferred passage joins up to three sentences, so its ceiling is three times
// the single-sentence limit.
const MAX_PASSAGE_CHARS = MAX_SENTENCE_CHARS * 3;

const screening = JSON.parse(readFileSync(new URL("../data/screening.json", import.meta.url)));
const extraction = JSON.parse(readFileSync(new URL("../data/scenarios.json", import.meta.url)));

const sourceById = new Map(screening.records.map((r) => [r.id, r]));

// The automated stand-in coder is free to run, so it codes every eligible source
// and coverage is estimated on all of them. HUMAN_SAMPLE_RATE is the rate the
// human track would use; the same coverage figure is recomputed on that subsample
// so the two can be compared. Open design choice 3 asks what the sampling rate
// should be, and the gap between the two estimates is evidence for answering it
// rather than a number picked because 20% sounded reasonable.
const HUMAN_SAMPLE_RATE = 0.2;
const SAMPLE_SEED = 20260925;

// ============================================================ TRACK 1

const STOP = new Set("the a an and or of to in for on with that this these those is are be by as at from can could may might will would should we our it its their than then such other using use used more most also been being have has had not no but which who whom whose there here".split(" "));
const tokens = (s) =>
  new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
  );
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};

const normalise = (s) => s.replace(/\s+/g, " ").trim();

/** The definition's own requirements, checked one at a time so failures are legible. */
function definitionChecks(scenario, source) {
  const p = scenario.passage;
  return [
    {
      id: "D1",
      requirement: "At least one causal element is present",
      pass: scenario.causalElements.length > 0,
      detail: scenario.causalElements.length
        ? `Carries ${scenario.causalElements.join(", ")}.`
        : "No causal element identified, so this is a statement rather than a scenario.",
    },
    {
      id: "D2",
      requirement: "The account concerns AI-enabled biological misuse",
      pass: BIO_ANCHOR.test(p),
      detail: BIO_ANCHOR.test(p)
        ? "A biological anchor is present in the passage itself, not only elsewhere in the source."
        : "No biological anchor in the passage. The source may be about AI risk in general, so this account does not meet the definition without one.",
    },
    {
      id: "D3",
      requirement: "The passage is the right size to be a coherent account",
      // Both bounds matter. Too short is not an account; too long means sentence
      // splitting failed and the "passage" is most of the source, which satisfies
      // every test by length alone.
      pass: normalise(p).length >= 60 && normalise(p).length <= MAX_PASSAGE_CHARS,
      detail:
        normalise(p).length > MAX_PASSAGE_CHARS
          ? `Passage is ${normalise(p).length} characters, past the ${MAX_PASSAGE_CHARS}-character limit. A passage this long indicates the source text did not split into sentences, so the apparent scenario is an artifact of the extractor rather than an account in the source.`
          : `Passage is ${normalise(p).length} characters.`,
    },
    {
      id: "D4",
      requirement: "Partial or complete status is recorded",
      pass: scenario.completeness === "partial" || scenario.completeness === "complete",
      detail: `Recorded as ${scenario.completeness}.`,
    },
  ];
}

const track1 = extraction.scenarios.map((s) => {
  const source = sourceById.get(s.sourceId);
  const haystack = source ? normalise(`${source.title}. ${source.abstract}`) : "";

  // Passage integrity. Inferred passages are joined with an ellipsis marker, so
  // each fragment is checked separately against the retrieved text.
  const fragments = normalise(s.passage).split(" […] ").map(normalise).filter(Boolean);
  const fragmentResults = fragments.map((f) => ({
    fragment: f.slice(0, 80) + (f.length > 80 ? "…" : ""),
    present: haystack.includes(f),
  }));
  const integrity = fragmentResults.every((f) => f.present);

  const checks = definitionChecks(s, source);
  const definitionPass = checks.every((c) => c.pass);

  // Machine verdict is deliberately three-valued. "auto-failed" is a decision;
  // "passes automated checks" is explicitly not the same as verified.
  const autoStatus = !integrity
    ? "failed-integrity"
    : !definitionPass
      ? "failed-definition"
      : s.duplicateOf
        ? "flagged-duplicate"
        : "awaiting-human-review";

  return {
    scenarioId: s.id,
    sourceId: s.sourceId,
    passageIntegrity: integrity,
    passageFragments: fragmentResults,
    definitionChecks: checks,
    definitionPass,
    duplicateOf: s.duplicateOf ?? null,
    autoStatus,
    // Persisted human decision. Null until a reviewer records one in the app.
    humanReview: { status: null, reviewer: null, note: null, decidedAt: null },
  };
});

const track1Summary = track1.reduce((acc, r) => {
  acc[r.autoStatus] = (acc[r.autoStatus] ?? 0) + 1;
  return acc;
}, {});

// ============================================================ TRACK 2

// Independent coder. Different unit of analysis (paragraph, not sentence),
// different causal vocabulary, and it draws the AI element from the source's
// subject rather than requiring it in the passage.
const CODER2_CAUSAL = [
  "because", "since", "so that", "in order to", "thereby", "consequently",
  "as a result", "would then", "could then", "makes it possible", "opens the",
  "creates the", "poses", "threatens", "allows", "permits", "means that",
  "implies", "suggests that", "raises the possibility", "potential for",
  "risk of", "danger of", "could be used", "may be used", "misused to",
];
const CODER2_AI = /(model|ai|artificial intelligence|machine learning|algorithm|tool|system|agent|network)/i;
const CODER2_HARM = /(misuse|weapon|harm|threat|attack|bioterror|pathogen|toxin|dangerous|catastroph|dual.use|malicious|hazard)/i;

const coder2RulesetHash = createHash("sha256")
  .update(JSON.stringify({ CODER2_CAUSAL, ai: CODER2_AI.source, harm: CODER2_HARM.source }))
  .digest("hex")
  .slice(0, 16);

function coder2(source) {
  const text = normalise(source.abstract || "");
  if (!text) return [];
  // Paragraph-level windows: overlapping pairs of sentences, which is closer to
  // how a human reads for an account than one sentence at a time.
  const sentences = splitSentences(text);
  const windows = [];
  for (let i = 0; i < sentences.length; i++) {
    windows.push(sentences.slice(i, i + 2).join(" "));
  }
  const sourceIsAboutAI = CODER2_AI.test(`${source.title} ${text}`);
  const found = [];
  for (const w of windows) {
    const causal = CODER2_CAUSAL.filter((c) => w.toLowerCase().includes(c));
    const harm = CODER2_HARM.test(w);
    if (causal.length && harm && sourceIsAboutAI) {
      found.push({
        sourceId: source.id,
        passage: w,
        causalMarkers: causal,
        phases: phasesIn(w),
      });
      if (found.length >= 3) break;
    }
  }
  return found;
}

// Seeded sample of the eligible sources, so the subset is reproducible from the
// seed alone rather than being whatever the last run happened to pick.
const eligibleIds = screening.records
  .filter((r) => r.stage1Verdict === "include" || r.stage1Verdict === "adjudicate")
  .map((r) => r.id);

const rng = mulberry32(SAMPLE_SEED);
const shuffled = [...eligibleIds].sort(() => rng() - 0.5);
const humanSampleIds = new Set(
  shuffled.slice(0, Math.max(1, Math.round(eligibleIds.length * HUMAN_SAMPLE_RATE)))
);

const comparisons = eligibleIds.map((id) => {
  const source = sourceById.get(id);
  const pass1 = extraction.scenarios.filter((s) => s.sourceId === id);
  const pass2 = coder2(source);

  const p1Tokens = pass1.map((s) => tokens(s.passage));
  const p2Tokens = pass2.map((s) => tokens(s.passage));

  // Match on passage overlap. Two codings of the same underlying account will
  // quote overlapping text even when they bound it differently.
  const matches = [];
  const matchedP1 = new Set();
  const matchedP2 = new Set();
  for (let i = 0; i < pass2.length; i++) {
    let best = { j: -1, score: 0 };
    for (let j = 0; j < pass1.length; j++) {
      if (matchedP1.has(j)) continue;
      const score = jaccard(p2Tokens[i], p1Tokens[j]);
      if (score > best.score) best = { j, score };
    }
    if (best.j >= 0 && best.score >= 0.3) {
      matches.push({
        coder2Passage: pass2[i].passage.slice(0, 120),
        pass1ScenarioId: pass1[best.j].id,
        overlap: Number(best.score.toFixed(2)),
      });
      matchedP1.add(best.j);
      matchedP2.add(i);
    }
  }

  return {
    sourceId: id,
    sourceTitle: source.title,
    inHumanSample: humanSampleIds.has(id),
    pass1Count: pass1.length,
    coder2Count: pass2.length,
    matched: matches.length,
    missedByPass1: pass2
      .filter((_, i) => !matchedP2.has(i))
      .map((s) => ({ passage: s.passage.slice(0, 200), causalMarkers: s.causalMarkers })),
    uniqueToPass1: pass1
      .filter((_, j) => !matchedP1.has(j))
      .map((s) => ({ scenarioId: s.id, passage: s.passage.slice(0, 200) })),
    matches,
  };
});

const tally = (rows) => {
  const coder2 = rows.reduce((n, c) => n + c.coder2Count, 0);
  const matched = rows.reduce((n, c) => n + c.matched, 0);
  return {
    sources: rows.length,
    coder2Scenarios: coder2,
    pass1Scenarios: rows.reduce((n, c) => n + c.pass1Count, 0),
    matched,
    missedByPass1: rows.reduce((n, c) => n + c.missedByPass1.length, 0),
    uniqueToPass1: rows.reduce((n, c) => n + c.uniqueToPass1.length, 0),
    // Recall of pass 1 against the independent coding. Deliberately not called
    // accuracy: Step 3 states the goal is to characterise coverage, not to treat
    // either pass as ground truth.
    recall: coder2 ? matched / coder2 : null,
  };
};

const full = tally(comparisons);
const sub = tally(comparisons.filter((c) => c.inHumanSample));

const coverage = {
  ...full,
  seed: SAMPLE_SEED,
  sourcesEligible: eligibleIds.length,
  humanSampleRate: HUMAN_SAMPLE_RATE,
  subsample: sub,
  // What the sampling-rate decision actually costs. Reported because open design
  // choice 3 asks for a rate and this is the evidence for choosing one.
  samplingNote:
    sub.coder2Scenarios === 0
      ? `Coding every eligible source found ${full.coder2Scenarios} accounts. The ${Math.round(HUMAN_SAMPLE_RATE * 100)}% subsample contained none at all, so at this corpus size that rate cannot estimate coverage — it would have reported nothing rather than a number with wide error bars. Either the human track samples far more heavily than 20%, or coverage is characterised on the full set and the human track is spent on adjudication instead.`
      : `Coding every eligible source gives recall ${(full.recall * 100).toFixed(1)}% over ${full.coder2Scenarios} independently identified accounts. The ${Math.round(HUMAN_SAMPLE_RATE * 100)}% subsample gives ${sub.recall === null ? "no estimate" : (sub.recall * 100).toFixed(1) + "%"} over ${sub.coder2Scenarios}. The gap between them is the cost of the sampling rate, and it is the argument for choosing the rate from this number rather than by convention.`,
  interpretation:
    full.coder2Scenarios === 0
      ? "The independent coder found nothing, so coverage cannot be estimated."
      : `Of ${full.coder2Scenarios} accounts the independent coder identified across all eligible sources, pass 1 also found ${full.matched}. The ${full.missedByPass1} it missed are the coverage gap, and each is listed so it can be inspected rather than summarised away.`,
};

writeFileSync(
  new URL("../data/verification.json", import.meta.url),
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      track1: {
        method:
          "Every extracted scenario checked for passage integrity against the retrieved text and against the four stated requirements of the scenario definition. Human adjudication of coherence is a separate, open queue.",
        summary: track1Summary,
        totalScenarios: track1.length,
        passageIntegrityFailures: track1.filter((r) => !r.passageIntegrity).length,
        definitionFailures: track1.filter((r) => !r.definitionPass).length,
        awaitingHumanReview: track1.filter((r) => r.autoStatus === "awaiting-human-review").length,
        records: track1,
      },
      track2: {
        method:
          "Every eligible source coded from scratch by an independent coder blind to pass 1, using a different unit of analysis and a different causal vocabulary, then compared on passage overlap to characterise coverage. The seeded subsample the human track would draw is reported alongside, so the cost of the sampling rate is visible.",
        coder2RulesetHash,
        coder2Kind: "rule-based stand-in for the blind human coder",
        coverage,
        comparisons,
      },
    },
    null,
    2
  )
);

console.log("TRACK 1", track1Summary);
console.log(
  `  passage integrity failures: ${track1.filter((r) => !r.passageIntegrity).length} of ${track1.length}`
);
console.log(`TRACK 2 coded all ${eligibleIds.length} eligible sources independently`);
console.log(
  `  coder 2 found ${full.coder2Scenarios}; pass 1 matched ${full.matched}; missed ${full.missedByPass1}; unique to pass 1 ${full.uniqueToPass1}`
);
console.log(
  `  recall: ${full.recall === null ? "n/a" : (full.recall * 100).toFixed(1) + "%"} on the full set; ` +
    `${sub.recall === null ? "no estimate" : (sub.recall * 100).toFixed(1) + "%"} on the ${Math.round(HUMAN_SAMPLE_RATE * 100)}% subsample (${sub.coder2Scenarios} accounts, ${sub.sources} sources)`
);
