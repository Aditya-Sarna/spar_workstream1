import { getSources, getPrismaFlow, getKappaPairs } from "@/lib/queries";

/**
 * Exports. PRISMA-ScR item 17 asks for a characteristics table of the included
 * sources. The register also emits RIS so the corpus can be opened in a
 * reference manager.
 */

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
};

export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get("format") ?? "characteristics-csv";

  if (format === "characteristics-csv") {
    // PRISMA-ScR item 17: characteristics of the sources that reached the
    // eligible set, plus the queue, each row carrying its verdict.
    const rows = getSources()
      .filter((s) => s.stage1_verdict !== "exclude")
      .map((s) => ({
        source_id: s.id,
        title: s.title,
        authors: s.authors,
        year: s.year,
        venue: s.venue,
        source_type: s.source_type,
        doi: s.doi ?? "",
        url: s.url,
        database: s.database_name,
        search_string: s.query_id,
        provenance: s.provenance,
        stage1_verdict: s.stage1_verdict,
        ai_role: s.grade.aiRole ?? "",
        ai_class: (s.grade.aiClass ?? []).join("; "),
        claimed_mechanisms: (s.grade.mechanisms ?? []).join("; "),
        evidence_status: s.grade.evidence ?? "",
        intent: s.grade.intent ?? "",
      }));
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="source-characteristics.csv"',
      },
    });
  }

  if (format === "ris") {
    const ris = getSources()
      .filter((s) => s.stage1_verdict !== "exclude")
      .map((s) => {
        const ty =
          s.source_type === "Peer-reviewed"
            ? "JOUR"
            : s.source_type === "Preprint"
              ? "UNPB"
              : "RPRT";
        const lines = [`TY  - ${ty}`, `TI  - ${s.title}`];
        for (const a of (s.authors ?? "").split(", ").filter(Boolean)) lines.push(`AU  - ${a}`);
        lines.push(`PY  - ${s.year}`);
        if (s.venue) lines.push(`JO  - ${s.venue}`);
        if (s.doi) lines.push(`DO  - ${s.doi}`);
        if (s.url) lines.push(`UR  - ${s.url}`);
        if (s.abstract) lines.push(`AB  - ${s.abstract.replace(/\s+/g, " ")}`);
        lines.push(`KW  - ${s.query_id}`, "ER  - ", "");
        return lines.join("\n");
      })
      .join("\n");
    return new Response(ris, {
      headers: {
        "Content-Type": "application/x-research-info-systems",
        "Content-Disposition": 'attachment; filename="corpus.ris"',
      },
    });
  }

  if (format === "protocol-json") {
    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        prismaFlow: getPrismaFlow(),
        // Between the two machine readings. Not inter-rater reliability.
        readingAgreement: getKappaPairs(),
      },
      {
        headers: { "Content-Disposition": 'attachment; filename="review-audit.json"' },
      }
    );
  }

  return Response.json(
    {
      error: "Unknown format.",
      available: ["characteristics-csv", "ris", "protocol-json"],
    },
    { status: 400 }
  );
}
