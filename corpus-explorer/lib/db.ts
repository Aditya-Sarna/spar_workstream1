// SQLite is the source of truth for review decisions. The pipeline JSON files are
// inputs — regenerating them never destroys a decision a reviewer recorded,
// because seeding is keyed on id and only ever inserts.
//
// Two run modes, both explicit in the UI:
//
//   writable    a local checkout, where screening and verification actually happen
//   read-only   a serverless deploy, where the filesystem is read-only. The app
//               serves the committed database and refuses writes rather than
//               accepting them into a filesystem that will be discarded.

import Database from "better-sqlite3";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import records from "@/data/records.json";
import screening from "@/data/screening.json";
import scenariosFile from "@/data/scenarios.json";
import verification from "@/data/verification.json";
import curatedSources from "@/data/curated-sources.json";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "review.db");

let db: Database.Database | null = null;
let writable = true;

function openDatabase(): Database.Database {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const handle = new Database(DB_PATH);
    handle.pragma("journal_mode = WAL");
    // Confirm writability rather than assuming it: a read-only mount fails here,
    // not three layers down inside a user's first attempt to save a decision.
    handle.exec("CREATE TABLE IF NOT EXISTS _writecheck (x INTEGER)");
    handle.exec("DROP TABLE _writecheck");
    writable = true;
    return handle;
  } catch {
    // Fall back to a scratch copy so reads still work where the checkout is
    // read-only (Vercel, a locked deploy). Writes are rejected at the API layer.
    const scratch = path.join(tmpdir(), "aixbio-review.db");
    if (existsSync(DB_PATH) && !existsSync(scratch)) copyFileSync(DB_PATH, scratch);
    const handle = new Database(scratch);
    writable = false;
    return handle;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT,
  year INTEGER,
  venue TEXT,
  source_type TEXT,
  url TEXT,
  doi TEXT,
  database_name TEXT,
  query_id TEXT,
  query_label TEXT,
  abstract TEXT,
  abstract_status TEXT,
  reviewer_note TEXT,
  provenance TEXT,
  stage1_verdict TEXT,
  exclusion_code TEXT,
  exclusion_reason TEXT,
  grade_json TEXT,
  extraction_status TEXT,
  reviewer_scenario_estimate INTEGER
);

-- One row per reviewer per source. Screeners A and B are seeded; a human
-- recording a verdict adds a third row rather than overwriting either.
CREATE TABLE IF NOT EXISTS screenings (
  source_id TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  reviewer_kind TEXT NOT NULL,
  stage TEXT NOT NULL,
  verdict TEXT NOT NULL,
  exclusion_code TEXT,
  exclusion_reason TEXT,
  basis TEXT,
  triad_json TEXT,
  matched_json TEXT,
  note TEXT,
  decided_at TEXT,
  PRIMARY KEY (source_id, reviewer, stage)
);

CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  passage TEXT NOT NULL,
  extraction_type TEXT NOT NULL,
  causal_elements_json TEXT,
  reasoning TEXT,
  completeness TEXT,
  completeness_note TEXT,
  pathway_phases_json TEXT,
  missing_phases_json TEXT,
  inference_gap TEXT,
  fragment_spread INTEGER,
  inference_strength TEXT,
  info_hazard INTEGER DEFAULT 0,
  info_hazard_note TEXT,
  duplicate_of TEXT,
  duplicate_similarity REAL,
  provisional INTEGER DEFAULT 0,
  auto_status TEXT,
  passage_integrity INTEGER,
  definition_checks_json TEXT,
  run_id TEXT
);

-- Track 1. One row per reviewer per scenario.
CREATE TABLE IF NOT EXISTS scenario_reviews (
  scenario_id TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  decided_at TEXT,
  PRIMARY KEY (scenario_id, reviewer)
);

-- Track 2. Scenarios coded from scratch, blind to the extraction pass.
CREATE TABLE IF NOT EXISTS blind_codings (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  coder TEXT NOT NULL,
  coder_kind TEXT NOT NULL,
  passage TEXT NOT NULL,
  matched_scenario_id TEXT,
  overlap REAL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS extraction_runs (
  run_id TEXT PRIMARY KEY,
  started_at TEXT,
  extractor TEXT,
  extractor_kind TEXT,
  model TEXT,
  prompt TEXT,
  settings_json TEXT,
  deviations_json TEXT,
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT,
  action TEXT,
  target TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_scenarios_source ON scenarios(source_id);
CREATE INDEX IF NOT EXISTS idx_screenings_source ON screenings(source_id);
CREATE INDEX IF NOT EXISTS idx_reviews_scenario ON scenario_reviews(scenario_id);
`;

function seed(handle: Database.Database) {
  const count = handle.prepare("SELECT COUNT(*) AS n FROM sources").get() as { n: number };
  if (count.n > 0) return;

  const insertSource = handle.prepare(`
    INSERT OR IGNORE INTO sources (id, title, authors, year, venue, source_type, url, doi,
      database_name, query_id, query_label, abstract, abstract_status, reviewer_note, provenance,
      stage1_verdict, exclusion_code, exclusion_reason, grade_json, extraction_status,
      reviewer_scenario_estimate)
    VALUES (@id, @title, @authors, @year, @venue, @source_type, @url, @doi, @database_name,
      @query_id, @query_label, @abstract, @abstract_status, @reviewer_note, @provenance,
      @stage1_verdict, @exclusion_code, @exclusion_reason, @grade_json, @extraction_status,
      @reviewer_scenario_estimate)
  `);

  const insertScreening = handle.prepare(`
    INSERT OR IGNORE INTO screenings (source_id, reviewer, reviewer_kind, stage, verdict,
      exclusion_code, exclusion_reason, basis, triad_json, matched_json, note, decided_at)
    VALUES (@source_id, @reviewer, @reviewer_kind, @stage, @verdict, @exclusion_code,
      @exclusion_reason, @basis, @triad_json, @matched_json, @note, @decided_at)
  `);

  const insertScenario = handle.prepare(`
    INSERT OR IGNORE INTO scenarios (id, source_id, passage, extraction_type, causal_elements_json,
      reasoning, completeness, completeness_note, pathway_phases_json, missing_phases_json,
      inference_gap, fragment_spread, inference_strength, info_hazard, info_hazard_note,
      duplicate_of, duplicate_similarity,
      provisional, auto_status, passage_integrity, definition_checks_json, run_id)
    VALUES (@id, @source_id, @passage, @extraction_type, @causal_elements_json, @reasoning,
      @completeness, @completeness_note, @pathway_phases_json, @missing_phases_json,
      @inference_gap, @fragment_spread, @inference_strength, @info_hazard, @info_hazard_note,
      @duplicate_of, @duplicate_similarity,
      @provisional, @auto_status, @passage_integrity, @definition_checks_json, @run_id)
  `);

  const insertBlind = handle.prepare(`
    INSERT OR IGNORE INTO blind_codings (id, source_id, coder, coder_kind, passage,
      matched_scenario_id, overlap, created_at)
    VALUES (@id, @source_id, @coder, @coder_kind, @passage, @matched_scenario_id, @overlap, @created_at)
  `);

  const insertRun = handle.prepare(`
    INSERT OR IGNORE INTO extraction_runs (run_id, started_at, extractor, extractor_kind, model,
      prompt, settings_json, deviations_json, summary_json)
    VALUES (@run_id, @started_at, @extractor, @extractor_kind, @model, @prompt, @settings_json,
      @deviations_json, @summary_json)
  `);

  const verificationByScenario = new Map(
    verification.track1.records.map((r: any) => [r.scenarioId, r])
  );

  handle.transaction(() => {
    for (const r of screening.records as any[]) {
      insertSource.run({
        id: r.id,
        title: r.title,
        authors: r.authors,
        year: r.year,
        venue: r.venue,
        source_type: r.sourceType,
        url: r.url,
        doi: r.doi || null,
        database_name: r.database,
        query_id: r.query,
        query_label: r.queryLabel,
        abstract: r.abstract,
        abstract_status: "retrieved from source API",
        reviewer_note: null,
        provenance: "harvested",
        stage1_verdict: r.stage1Verdict,
        exclusion_code: r.exclusionCode ?? null,
        exclusion_reason: r.exclusionReason ?? null,
        grade_json: JSON.stringify(r.grade),
        extraction_status:
          r.stage1Verdict === "exclude" ? "not-eligible" : "extracted-from-abstract",
        reviewer_scenario_estimate: null,
      });

      for (const s of [r.screenA, r.screenB]) {
        insertScreening.run({
          source_id: r.id,
          reviewer: `Screener ${s.screener}`,
          reviewer_kind: "automated",
          stage: "title-abstract",
          verdict: s.verdict,
          exclusion_code: s.exclusionCode ?? null,
          exclusion_reason: s.exclusionReason ?? null,
          basis: s.basis,
          triad_json: JSON.stringify(s.triad),
          matched_json: JSON.stringify(s.matched),
          note: s.sentence ?? null,
          decided_at: screening.generated,
        });
      }
    }

    for (const c of curatedSources as any[]) {
      insertSource.run({
        id: c.id,
        title: c.title,
        authors: c.authors,
        year: c.year,
        venue: c.venue,
        source_type: c.sourceType,
        url: c.url,
        doi: c.doi || null,
        database_name: c.database,
        query_id: c.query,
        query_label: c.queryLabel,
        abstract: null,
        abstract_status: c.abstractStatus,
        reviewer_note: c.reviewerNote,
        provenance: "curated",
        stage1_verdict: c.verdict,
        exclusion_code: c.exclusionCode,
        exclusion_reason: c.exclusionReason,
        grade_json: JSON.stringify(c.grade),
        extraction_status: c.extractionStatus,
        reviewer_scenario_estimate: c.reviewerScenarioEstimate,
      });
      insertScreening.run({
        source_id: c.id,
        reviewer: "Reviewer 1 (named source)",
        reviewer_kind: "human",
        stage: "full-text",
        verdict: c.verdict,
        exclusion_code: c.exclusionCode,
        exclusion_reason: c.exclusionReason,
        basis: "full text read by reviewer",
        triad_json: JSON.stringify(c.triad),
        matched_json: null,
        note: c.reviewerNote,
        decided_at: null,
      });
    }

    for (const s of scenariosFile.scenarios as any[]) {
      const v: any = verificationByScenario.get(s.id);
      insertScenario.run({
        id: s.id,
        source_id: s.sourceId,
        passage: s.passage,
        extraction_type: s.extractionType,
        causal_elements_json: JSON.stringify(s.causalElements),
        reasoning: s.reasoning,
        completeness: s.completeness,
        completeness_note: s.completenessNote,
        pathway_phases_json: JSON.stringify(s.pathwayPhases ?? []),
        missing_phases_json: JSON.stringify(s.missingPhases ?? []),
        inference_gap: s.inferenceGap ?? null,
        fragment_spread: s.fragmentSpread ?? null,
        // Direct extractions come from one sentence, so the notion of an inference
        // holding together does not apply to them.
        inference_strength: s.inferenceStrength ?? "n/a — stated directly",
        info_hazard: s.infoHazard ? 1 : 0,
        info_hazard_note: s.infoHazardNote ?? null,
        duplicate_of: s.duplicateOf ?? null,
        duplicate_similarity: s.duplicateSimilarity ?? null,
        provisional: s.provisional ? 1 : 0,
        auto_status: v?.autoStatus ?? "awaiting-human-review",
        passage_integrity: v?.passageIntegrity ? 1 : 0,
        definition_checks_json: JSON.stringify(v?.definitionChecks ?? []),
        run_id: scenariosFile.run.runId,
      });
    }

    for (const c of verification.track2.comparisons as any[]) {
      c.matches.forEach((m: any, i: number) =>
        insertBlind.run({
          id: `${c.sourceId}--b${i + 1}`,
          source_id: c.sourceId,
          coder: "Blind coder 2",
          coder_kind: "automated",
          passage: m.coder2Passage,
          matched_scenario_id: m.pass1ScenarioId,
          overlap: m.overlap,
          created_at: verification.generated,
        })
      );
      c.missedByPass1.forEach((m: any, i: number) =>
        insertBlind.run({
          id: `${c.sourceId}--miss${i + 1}`,
          source_id: c.sourceId,
          coder: "Blind coder 2",
          coder_kind: "automated",
          passage: m.passage,
          matched_scenario_id: null,
          overlap: null,
          created_at: verification.generated,
        })
      );
    }

    const run: any = scenariosFile.run;
    insertRun.run({
      run_id: run.runId,
      started_at: run.startedAt,
      extractor: run.extractor,
      extractor_kind: run.extractorKind,
      model: run.model,
      prompt: run.prompt,
      settings_json: JSON.stringify(run.settings),
      deviations_json: JSON.stringify(run.deviations),
      summary_json: JSON.stringify({
        sourcesProcessed: run.sourcesProcessed,
        scenariosExtracted: run.scenariosExtracted,
        byExtractionType: run.byExtractionType,
        byCompleteness: run.byCompleteness,
        duplicatesFlagged: run.duplicatesFlagged,
        infoHazardFlagged: run.infoHazardFlagged,
        sourcesYieldingNone: run.sourcesYieldingNone,
        heldForFullText: run.heldForFullText,
        heldForFullTextEstimate: run.heldForFullTextEstimate,
      }),
    });
  })();
}

export function getDb() {
  if (!db) {
    db = openDatabase();
    db.exec(SCHEMA);
    seed(db);
  }
  return db;
}

export function isWritable() {
  getDb();
  return writable;
}

export function logAudit(actor: string, action: string, target: string, detail: string) {
  getDb()
    .prepare("INSERT INTO audit_log (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .run(new Date().toISOString(), actor, action, target, detail);
}
