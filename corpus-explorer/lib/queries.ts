import { getDb, isWritable } from "./db";
import records from "@/data/records.json";
import screeningFile from "@/data/screening.json";
import verification from "@/data/verification.json";
export {
  SCENARIO_DEFINITION,
  CAUSAL_ELEMENT_TYPES,
  EXCLUSION_CODES,
  TITLE_ABSTRACT_INCLUSION,
  FULL_TEXT_INCLUSION,
  INCLUSION_CRITERIA,
  NEVER_EXCLUDE_ON,
  TRIAD,
} from "./criteria";

export type Phase = "intent / ideation" | "capability / acquisition" | "release / harm";

// ---------------------------------------------------------------------- sources

export type SourceRow = {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  source_type: string;
  url: string;
  doi: string | null;
  database_name: string;
  query_id: string;
  query_label: string;
  abstract: string | null;
  abstract_status: string;
  reviewer_note: string | null;
  provenance: string;
  stage1_verdict: string;
  exclusion_code: string | null;
  exclusion_reason: string | null;
  grade_json: string;
  extraction_status: string;
  reviewer_scenario_estimate: number | null;
};

export function getSources() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM sources ORDER BY year DESC, title").all() as SourceRow[];
  const screenings = db
    .prepare("SELECT * FROM screenings")
    .all() as any[];
  const scenarioCounts = db
    .prepare("SELECT source_id, COUNT(*) AS n FROM scenarios GROUP BY source_id")
    .all() as { source_id: string; n: number }[];
  const countMap = new Map(scenarioCounts.map((r) => [r.source_id, r.n]));
  const byId = new Map<string, any[]>();
  for (const s of screenings) {
    if (!byId.has(s.source_id)) byId.set(s.source_id, []);
    byId.get(s.source_id)!.push(s);
  }
  return rows.map((r) => ({
    ...r,
    grade: JSON.parse(r.grade_json),
    screenings: (byId.get(r.id) ?? []).map((s) => ({
      ...s,
      triad: s.triad_json ? JSON.parse(s.triad_json) : null,
      matched: s.matched_json ? JSON.parse(s.matched_json) : null,
    })),
    scenarioCount: countMap.get(r.id) ?? 0,
  }));
}

export type SourceWithMeta = ReturnType<typeof getSources>[number];

// -------------------------------------------------------------------- scenarios

export function getScenarios() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.*, src.title AS source_title, src.year AS source_year,
              src.source_type AS source_type, src.url AS source_url,
              src.query_id AS query_id, src.stage1_verdict AS source_stage1
       FROM scenarios s JOIN sources src ON src.id = s.source_id
       ORDER BY s.extraction_type, s.id`
    )
    .all() as any[];
  const reviews = db.prepare("SELECT * FROM scenario_reviews").all() as any[];
  const byScenario = new Map<string, any[]>();
  for (const r of reviews) {
    if (!byScenario.has(r.scenario_id)) byScenario.set(r.scenario_id, []);
    byScenario.get(r.scenario_id)!.push(r);
  }
  return rows.map((r) => ({
    ...r,
    causalElements: JSON.parse(r.causal_elements_json ?? "[]") as string[],
    pathwayPhases: JSON.parse(r.pathway_phases_json ?? "[]") as string[],
    missingPhases: JSON.parse(r.missing_phases_json ?? "[]") as string[],
    definitionChecks: JSON.parse(r.definition_checks_json ?? "[]") as {
      id: string;
      requirement: string;
      pass: boolean;
      detail: string;
    }[],
    infoHazard: !!r.info_hazard,
    passageIntegrity: !!r.passage_integrity,
    provisional: !!r.provisional,
    reviews: byScenario.get(r.id) ?? [],
    // A scenario is verified only when a human has recorded a decision. Passing
    // the automated checks is a precondition, not a verification.
    verificationStatus:
      (byScenario.get(r.id) ?? []).find((x) => x.status)?.status ??
      (r.auto_status === "awaiting-human-review" ? "unverified" : r.auto_status),
  }));
}

export type ScenarioRow = ReturnType<typeof getScenarios>[number];

// ------------------------------------------------------------------------ kappa

export type KappaResult = {
  reviewerA: string;
  reviewerB: string;
  n: number;
  both: number;
  onlyA: number;
  onlyB: number;
  neither: number;
  observedAgreement: number;
  expectedAgreement: number;
  kappa: number;
  band: string;
  nested: boolean;
  stricter: string | null;
  disagreements: number;
  bothAutomated: boolean;
};

/**
 * Landis & Koch (1977) bands, the convention this literature cites — except that
 * their lowest band starts at 0, which leaves nothing to say about a kappa of
 * exactly 0. Reporting that as "slight" implies agreement that is not there, so
 * κ ≤ 0 is named for what it is.
 */
const band = (k: number) =>
  k <= 0
    ? "none beyond chance"
    : k < 0.21
      ? "slight"
      : k < 0.41
        ? "fair"
        : k < 0.61
          ? "moderate"
          : k < 0.81
            ? "substantial"
            : "almost perfect";

/**
 * Cohen's kappa for every pair of reviewers who screened overlapping records.
 * Computed from the screenings table rather than baked in, so a human reviewer
 * who screens records in the app appears here with no code change.
 */
export function getKappaPairs(): KappaResult[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT source_id, reviewer, verdict FROM screenings WHERE stage = 'title-abstract'")
    .all() as { source_id: string; reviewer: string; verdict: string }[];

  const byReviewer = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (!byReviewer.has(r.reviewer)) byReviewer.set(r.reviewer, new Map());
    byReviewer.get(r.reviewer)!.set(r.source_id, r.verdict);
  }

  const reviewers = [...byReviewer.keys()].sort();
  const out: KappaResult[] = [];

  for (let i = 0; i < reviewers.length; i++) {
    for (let j = i + 1; j < reviewers.length; j++) {
      const a = byReviewer.get(reviewers[i])!;
      const b = byReviewer.get(reviewers[j])!;
      const shared = [...a.keys()].filter((k) => b.has(k));
      if (shared.length < 2) continue;
      let both = 0, onlyA = 0, onlyB = 0, neither = 0;
      for (const k of shared) {
        const ia = a.get(k) === "include";
        const ib = b.get(k) === "include";
        if (ia && ib) both++;
        else if (ia) onlyA++;
        else if (ib) onlyB++;
        else neither++;
      }
      const n = shared.length;
      const po = (both + neither) / n;
      const pe = ((both + onlyA) * (both + onlyB) + (onlyB + neither) * (onlyA + neither)) / (n * n);
      const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
      out.push({
        reviewerA: reviewers[i],
        reviewerB: reviewers[j],
        n, both, onlyA, onlyB, neither,
        observedAgreement: po,
        expectedAgreement: pe,
        kappa,
        band: band(kappa),
        // Disagreement running only one way means one rule is strictly stricter
        // than the other. Kappa then measures the strictness gap, not two
        // independent judgements, and saying so matters more than the number.
        // Meaningless below a handful of shared records, where one-directional
        // disagreement is just as likely to be small-sample noise.
        nested: (onlyA === 0 || onlyB === 0) && shared.length >= 20,
        // Which direction the stricter rule ran, so the caller does not have to
        // guess which reviewer the asymmetry belongs to.
        stricter: onlyA === 0 && onlyB > 0 ? reviewers[i] : onlyB === 0 && onlyA > 0 ? reviewers[j] : null,
        disagreements: onlyA + onlyB,
        bothAutomated:
          reviewers[i].startsWith("Screener") && reviewers[j].startsWith("Screener"),
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ PRISMA flow

const QUERY_CAP = 40;

function normTitle(t: string) {
  return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function arxivId(s: string | null | undefined) {
  const m = (s || "").match(/(\d{4}\.\d{4,5})/);
  return m ? m[1] : null;
}

/**
 * Named-list sources that the database search already retrieved.
 *
 * A record coded E9 has been read as a duplicate and says so, which is the
 * authority. The DOI, title and arXiv-id match is kept as well so a newly added
 * named source that collides with a harvested record is caught before anyone
 * hand-codes it.
 */
function overlapWithHarvested(curated: SourceRow[], harvested: SourceRow[]) {
  const byTitle = new Map(harvested.map((h) => [normTitle(h.title), h]));
  const byDoi = new Map(
    harvested.filter((h) => h.doi).map((h) => [h.doi!.toLowerCase(), h])
  );
  return curated.filter((c) => {
    if (c.exclusion_code === "E9") return true;
    if (c.doi && byDoi.has(c.doi.toLowerCase())) return true;
    if (byTitle.has(normTitle(c.title))) return true;
    const id = arxivId(c.url) || arxivId(c.venue);
    return id ? harvested.some((h) => (h.url || "").includes(id)) : false;
  });
}

export function getPrismaFlow() {
  const db = getDb();
  const sources = db.prepare("SELECT * FROM sources").all() as SourceRow[];
  const harvested = sources.filter((s) => s.provenance === "harvested");
  const curated = sources.filter((s) => s.provenance === "curated");
  const overlap = overlapWithHarvested(curated, harvested);
  const curatedUnique = curated.filter((c) => !overlap.some((o) => o.id === c.id));

  const byVerdict = (set: SourceRow[], v: string) =>
    set.filter((s) => s.stage1_verdict === v).length;

  const reasonCounts = (set: SourceRow[]) =>
    set
      .filter((s) => s.stage1_verdict === "exclude")
      .reduce<Record<string, number>>((acc, s) => {
        const k = s.exclusion_code ?? "E?";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});

  const excludedByReason = reasonCounts(harvested);
  // Counted over the unique named sources only. The duplicates are already
  // reported as removed at the identification step, and counting their E9 code
  // here as well would show the same three records leaving the flow twice.
  const curatedExcludedByReason = reasonCounts(curatedUnique);

  const scenarioCount = (db.prepare("SELECT COUNT(*) AS n FROM scenarios").get() as any).n;
  const verifiedCount = (
    db.prepare("SELECT COUNT(DISTINCT scenario_id) AS n FROM scenario_reviews WHERE status IS NOT NULL").get() as any
  ).n;
  const failedAuto = (
    db.prepare("SELECT COUNT(*) AS n FROM scenarios WHERE auto_status != 'awaiting-human-review'").get() as any
  ).n;

  const includedStage1 = byVerdict(harvested, "include");
  const humanDecided = new Set(
    (
      db
        .prepare(
          "SELECT DISTINCT source_id FROM screenings WHERE reviewer_kind = 'human' AND stage = 'title-abstract'"
        )
        .all() as { source_id: string }[]
    ).map((r) => r.source_id)
  );
  const decidedByHuman = harvested.filter((s) => humanDecided.has(s.id));
  const includedByHuman = byVerdict(decidedByHuman, "include");
  const excludedByHuman = byVerdict(decidedByHuman, "exclude");
  const curatedIncluded = byVerdict(curated, "include");
  const curatedIncludedUnique = byVerdict(curatedUnique, "include");
  const queryCalls = Object.keys(records.perDatabase as object).length * Object.keys(records.perQuery as object).length;

  return {
    identified: records.identified,
    perDatabase: records.perDatabase as Record<string, number>,
    duplicatesByDoi: records.duplicatesByDoi,
    duplicatesByTitle: records.duplicatesByTitle,
    handSearched: curated.length,
    handSearchedAlreadyRetrieved: overlap.length,
    handSearchedUnique: curatedUnique.length,
    screened: harvested.length,
    excludedStage1: byVerdict(harvested, "exclude"),
    excludedByReason,
    adjudicationQueue: byVerdict(harvested, "adjudicate"),
    includedStage1,
    includedByReadings: includedStage1 - includedByHuman,
    includedByHuman,
    excludedByHuman,
    eligibleForExtraction: includedStage1,
    curatedIncluded,
    curatedIncludedUnique,
    curatedExcluded: byVerdict(curatedUnique, "exclude"),
    curatedExcludedByReason,
    fullTextAssessed: curatedUnique.length,
    fullTextPending: includedStage1,
    uniqueSourcesIn: includedStage1 + curatedIncludedUnique,
    scenariosExtracted: scenarioCount,
    scenariosFailingAutoChecks: failedAuto,
    scenariosVerified: verifiedCount,
    heldForFullTextExtraction: curatedIncludedUnique,
    reviewerScenarioEstimate: curated.reduce((n, c) => n + (c.reviewer_scenario_estimate ?? 0), 0),
    retrievalFailures: records.failures as string[],
    queryCap: QUERY_CAP,
    queryCalls,
  };
}

// --------------------------------------------------------------------- coverage

export function getCoverage() {
  const db = getDb();
  const blind = db.prepare("SELECT * FROM blind_codings").all() as any[];
  const matched = blind.filter((b) => b.matched_scenario_id).length;
  const missed = blind.filter((b) => !b.matched_scenario_id).length;
  return {
    ...verification.track2.coverage,
    blindCodings: blind.length,
    matched,
    missed,
    missedPassages: blind.filter((b) => !b.matched_scenario_id),
    comparisons: verification.track2.comparisons as any[],
    coderKind: verification.track2.coder2Kind,
    coderRulesetHash: verification.track2.coder2RulesetHash,
    method: verification.track2.method,
  };
}

// ------------------------------------------------------------------ search meta

export function getSearchStrings() {
  const db = getDb();
  const counts = db
    .prepare("SELECT query_id, COUNT(*) AS n FROM sources GROUP BY query_id")
    .all() as { query_id: string; n: number }[];
  const countMap = new Map(counts.map((c) => [c.query_id, c.n]));
  const perQuery = records.perQuery as Record<string, number>;

  const queryDefs = [
    { id: "Q1", label: "LLM × biosecurity × misuse", string: 'all:"large language model" AND all:"biosecurity" / large language model biosecurity misuse' },
    { id: "Q2", label: "AI × biological weapons", string: 'all:"artificial intelligence" AND all:"biological weapons"' },
    { id: "Q3", label: "biological design tools × misuse", string: 'all:"biological design tool" OR all:"protein design" AND all:"biosecurity"' },
    { id: "Q4", label: "AI × dual-use biology", string: 'all:"dual-use" AND all:"artificial intelligence" AND all:"biology"' },
    { id: "Q5", label: "LLM × bioweapon uplift", string: 'all:"language model" AND all:"bioweapon"' },
    { id: "Q6", label: "AI × pandemic pathogen risk", string: 'all:"artificial intelligence" AND all:"pandemic pathogen"' },
    { id: "Q7", label: "frontier model CBRN evaluation", string: 'all:"frontier model" AND all:"CBRN"' },
    { id: "Q8", label: "nucleic acid synthesis screening × AI", string: 'all:"nucleic acid synthesis" AND all:"screening"' },
    { id: "Q9", label: "AI biosafety governance", string: 'all:"AI" AND all:"biosafety" AND all:"governance"' },
    { id: "Q10", label: "autonomous laboratory × chemical safety", string: 'all:"autonomous" AND all:"laboratory" AND all:"chemical safety"' },
    { id: "Q11", label: "AI × bioterrorism", string: 'all:"artificial intelligence" AND all:"bioterrorism"' },
    { id: "Q12", label: "LLM × gain-of-function", string: 'all:"language model" AND all:"gain-of-function"' },
    { id: "Q13", label: "AI × synthetic biology dual-use", string: 'all:"synthetic biology" AND all:"artificial intelligence"' },
    { id: "Q14", label: "DNA synthesis × biosecurity", string: 'all:"DNA synthesis" AND all:"biosecurity"' },
    { id: "Q15", label: "red team × biosecurity", string: 'all:"red team" AND all:"biosecurity"' },
  ];

  return [
    {
      id: "NS",
      label: "Named sources",
      string:
        "Named list: RAND, CSET, CLTR, NTI, NASEM, DHS, CRS, AI-lab evaluations",
      sources: "Named list",
      identified: null as number | null,
      retained: (countMap.get("NS") ?? 0) + (countMap.get("HS") ?? 0),
    },
    ...queryDefs.map((q) => ({
      ...q,
      sources: "arXiv + OpenAlex",
      identified: perQuery[q.id] ?? 0,
      retained: countMap.get(q.id) ?? 0,
    })),
  ];
}

// ----------------------------------------------------------------- run metadata

export function getExtractionRuns() {
  const db = getDb();
  return (db.prepare("SELECT * FROM extraction_runs ORDER BY started_at DESC").all() as any[]).map(
    (r) => ({
      ...r,
      settings: JSON.parse(r.settings_json ?? "{}"),
      deviations: JSON.parse(r.deviations_json ?? "[]") as string[],
      summary: JSON.parse(r.summary_json ?? "{}"),
    })
  );
}

export function getReviewMeta() {
  return {
    writable: isWritable(),
    screeningGenerated: screeningFile.generated,
    retrievalGenerated: records.generated,
    verificationGenerated: verification.generated,
    reasonAgreement: screeningFile.reasonAgreement as number | null,
    reasonAgreementDenominator: screeningFile.reasonAgreementDenominator as number,
    track1: {
      method: verification.track1.method,
      summary: verification.track1.summary as Record<string, number>,
      passageIntegrityFailures: verification.track1.passageIntegrityFailures,
      definitionFailures: verification.track1.definitionFailures,
      awaitingHumanReview: verification.track1.awaitingHumanReview,
      total: verification.track1.totalScenarios,
    },
  };
}
