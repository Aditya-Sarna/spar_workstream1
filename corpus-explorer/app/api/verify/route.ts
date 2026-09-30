import { NextResponse } from "next/server";
import { getDb, isWritable, logAudit } from "@/lib/db";

/**
 * Track 1 verification: records one reviewer's decision on one extracted scenario,
 * checked against the source text and the scenario definition.
 *
 * The four statuses are the ones Step 3 calls for. "supported" keeps the scenario
 * in the library; "unsupported" and "duplicate" are the two removal grounds the
 * protocol names; "unclear" exists so a reviewer can register that they looked
 * without forcing a decision they cannot defend.
 */
const STATUSES: Record<string, string> = {
  supported: "Checked against the source text and the scenario definition; the account holds.",
  unsupported: "Not supported by the source text, or does not meet the scenario definition. Removed.",
  duplicate: "The same account as another extraction. Removed, with the retained scenario noted.",
  unclear: "Reviewed but not resolvable without the full text or a second opinion.",
};

export async function POST(req: Request) {
  if (!isWritable())
    return NextResponse.json(
      {
        error:
          "This deployment is read-only. Verification decisions must be recorded in a local checkout, where the SQLite database is writable.",
      },
      { status: 503 }
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });

  const { scenarioId, reviewer, status, note } = body;

  if (!scenarioId || !reviewer || !status)
    return NextResponse.json(
      { error: "scenarioId, reviewer, and status are all required." },
      { status: 400 }
    );
  if (!STATUSES[status])
    return NextResponse.json(
      { error: `status must be one of ${Object.keys(STATUSES).join(", ")}.` },
      { status: 400 }
    );
  if (status === "duplicate" && !note)
    return NextResponse.json(
      { error: "Marking a scenario duplicate requires a note naming the scenario it duplicates." },
      { status: 400 }
    );

  const db = getDb();
  const scenario = db.prepare("SELECT id FROM scenarios WHERE id = ?").get(scenarioId);
  if (!scenario) return NextResponse.json({ error: "Unknown scenarioId." }, { status: 404 });

  db.prepare(
    `INSERT INTO scenario_reviews (scenario_id, reviewer, status, note, decided_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(scenario_id, reviewer) DO UPDATE SET
       status = excluded.status, note = excluded.note, decided_at = excluded.decided_at`
  ).run(scenarioId, reviewer, status, note ?? null, new Date().toISOString());

  logAudit(reviewer, `verify:${status}`, scenarioId, note ?? "");

  const reviews = db
    .prepare("SELECT reviewer, status, note, decided_at FROM scenario_reviews WHERE scenario_id = ?")
    .all(scenarioId);

  return NextResponse.json({ ok: true, scenarioId, reviews });
}

export async function GET() {
  return NextResponse.json({ statuses: STATUSES });
}
