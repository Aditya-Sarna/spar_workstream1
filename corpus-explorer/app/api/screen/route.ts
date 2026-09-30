import { NextResponse } from "next/server";
import { getDb, isWritable, logAudit } from "@/lib/db";
import { EXCLUSION_CODES } from "@/lib/criteria";

/**
 * Records one human screening verdict. A human decision is inserted as an
 * additional reviewer row, never as an overwrite of a screener's verdict, so the
 * disagreement that prompted adjudication stays on the record afterwards.
 */
export async function POST(req: Request) {
  if (!isWritable())
    return NextResponse.json(
      {
        error:
          "This deployment is read-only. Screening decisions must be recorded in a local checkout, where the SQLite database is writable.",
      },
      { status: 503 }
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });

  const { sourceId, reviewer, verdict, exclusionCode, note, stage } = body;

  if (!sourceId || !reviewer || !verdict)
    return NextResponse.json(
      { error: "sourceId, reviewer, and verdict are all required." },
      { status: 400 }
    );
  if (verdict !== "include" && verdict !== "exclude")
    return NextResponse.json(
      { error: "verdict must be 'include' or 'exclude'." },
      { status: 400 }
    );
  if (verdict === "exclude" && !exclusionCode)
    return NextResponse.json(
      { error: "An exclusion requires a coded reason, so the flow diagram can report it." },
      { status: 400 }
    );
  if (exclusionCode && !EXCLUSION_CODES[exclusionCode])
    return NextResponse.json(
      { error: `Unknown exclusion code ${exclusionCode}. Use one of ${Object.keys(EXCLUSION_CODES).join(", ")}.` },
      { status: 400 }
    );

  const db = getDb();
  const source = db.prepare("SELECT id FROM sources WHERE id = ?").get(sourceId);
  if (!source) return NextResponse.json({ error: "Unknown sourceId." }, { status: 404 });

  const resolvedStage = stage === "full-text" ? "full-text" : "title-abstract";

  db.prepare(
    `INSERT INTO screenings (source_id, reviewer, reviewer_kind, stage, verdict, exclusion_code,
       exclusion_reason, basis, triad_json, matched_json, note, decided_at)
     VALUES (?, ?, 'human', ?, ?, ?, ?, 'human judgement', NULL, NULL, ?, ?)
     ON CONFLICT(source_id, reviewer, stage) DO UPDATE SET
       verdict = excluded.verdict,
       exclusion_code = excluded.exclusion_code,
       exclusion_reason = excluded.exclusion_reason,
       note = excluded.note,
       decided_at = excluded.decided_at`
  ).run(
    sourceId,
    reviewer,
    resolvedStage,
    verdict,
    exclusionCode ?? null,
    exclusionCode ? EXCLUSION_CODES[exclusionCode].label : null,
    note ?? null,
    new Date().toISOString()
  );

  // A human verdict resolves the adjudication queue for that record.
  const current = db
    .prepare("SELECT stage1_verdict FROM sources WHERE id = ?")
    .get(sourceId) as { stage1_verdict: string };
  if (current.stage1_verdict === "adjudicate") {
    db.prepare(
      "UPDATE sources SET stage1_verdict = ?, exclusion_code = ?, exclusion_reason = ? WHERE id = ?"
    ).run(
      verdict,
      exclusionCode ?? null,
      exclusionCode ? EXCLUSION_CODES[exclusionCode].label : null,
      sourceId
    );
  }

  logAudit(reviewer, `screen:${verdict}`, sourceId, exclusionCode ?? note ?? "");

  return NextResponse.json({ ok: true, sourceId, verdict, reviewer, stage: resolvedStage });
}
