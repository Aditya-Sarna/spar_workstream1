"use client";

import { useMemo, useState } from "react";

type Screening = {
  reviewer: string;
  reviewer_kind: string;
  stage: string;
  verdict: string;
  exclusion_code: string | null;
  basis: string | null;
  triad: { ai: boolean; harm: boolean; connective: boolean } | null;
  matched: { ai: string[]; harm: string[]; connective: string[] } | null;
  note: string | null;
};

type Source = {
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
  grade: {
    mechanisms?: string[];
    aiClass?: string[];
    aiRole?: string;
    evidence?: string;
    intent?: string;
    stages?: string[];
  };
  extraction_status: string;
  reviewer_scenario_estimate: number | null;
  scenarioCount: number;
  screenings: Screening[];
};

const VERDICT_LABEL: Record<string, string> = {
  adjudicate: "human review required",
  include: "included",
  exclude: "excluded",
  duplicate: "duplicate",
};

const VERDICT_ORDER = ["include", "adjudicate", "exclude", "duplicate"];

const FACETS = [
  { key: "stage1_verdict", label: "Screening outcome" },
  { key: "provenance", label: "How it was found" },
  { key: "query_id", label: "Search string" },
  { key: "source_type", label: "Source type" },
  { key: "database_name", label: "Database" },
] as const;

export default function SourceRegister({
  sources,
}: {
  sources: Source[];
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({
    stage1_verdict: ["include"],
  });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const gradeFacets = ["aiRole", "evidence", "intent"] as const;

  const curated = (s: Source) => s.provenance === "curated";

  const valuesOf = (s: Source, key: string): string[] => {
    if (gradeFacets.includes(key as never)) return [String(s.grade[key as never] ?? "unrecorded")];
    if (key === "mechanisms" || key === "aiClass") return (s.grade[key] ?? []) as string[];
    if (key === "stage1_verdict")
      return [s.exclusion_code === "E9" ? "duplicate" : s.stage1_verdict];
    if (key === "provenance") return [curated(s) ? "named sources" : "database search"];
    // Named sources have no search string or database, so they sit only under provenance.
    if (key === "query_id" || key === "database_name") return curated(s) ? [] : [s[key]];
    const v = (s as unknown as Record<string, unknown>)[key];
    return Array.isArray(v) ? (v as string[]) : [String(v)];
  };

  const allFacets = [
    ...FACETS,
    { key: "aiRole", label: "AI role strength (metadata only)" },
    { key: "mechanisms", label: "Claimed mechanism (metadata only)" },
    { key: "evidence", label: "Evidence status (metadata only)" },
    { key: "intent", label: "Intent (metadata only)" },
  ];

  const toggle = (key: string, value: string) =>
    setSelected((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      const out = { ...prev };
      if (next.length) out[key] = next;
      else delete out[key];
      return out;
    });

  const counts = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const { key } of allFacets) {
      map[key] = {};
      for (const s of sources) for (const v of valuesOf(s, key)) map[key][v] = (map[key][v] ?? 0) + 1;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank = (s: Source) => {
      const v = s.exclusion_code === "E9" ? "duplicate" : s.stage1_verdict;
      const i = VERDICT_ORDER.indexOf(v);
      return i === -1 ? VERDICT_ORDER.length : i;
    };
    return sources
      .filter((s) => {
        for (const [key, picked] of Object.entries(selected)) {
          const vals = valuesOf(s, key);
          if (!picked.some((p) => vals.includes(p))) return false;
        }
        if (!needle) return true;
        return [s.title, s.authors, s.venue, s.abstract, s.reviewer_note].some((f) =>
          (f ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => rank(a) - rank(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, selected, q]);

  const activeSecondary = Object.keys(selected).filter((k) => k !== "stage1_verdict").length;

  const renderFacet = ({ key, label }: { key: string; label: string }) => (
    <div className="facet" key={key}>
      <h3>{label}</h3>
      {Object.keys(counts[key])
        .filter((v) => v && v !== "undefined" && v !== "null" && v !== "unrecorded")
        .sort((a, b) =>
          key === "query_id"
            ? a.localeCompare(b, undefined, { numeric: true })
            : key === "stage1_verdict"
              ? VERDICT_ORDER.indexOf(a) - VERDICT_ORDER.indexOf(b)
              : a.localeCompare(b)
        )
        .map((value) => (
          <label className="opt" key={value}>
            <input
              type="checkbox"
              checked={(selected[key] ?? []).includes(value)}
              onChange={() => toggle(key, value)}
            />
            {key === "stage1_verdict" ? VERDICT_LABEL[value] ?? value : value}
            <span className="n">{counts[key][value]}</span>
          </label>
        ))}
    </div>
  );

  const queue = sources.filter((s) => s.stage1_verdict === "adjudicate").length;
  const included = sources.filter((s) => s.stage1_verdict === "include");
  const includedNamed = included.filter(curated).length;
  const namedTotal = sources.filter(curated).length;
  const includedByHuman = included.filter(
    (s) => !curated(s) && s.screenings.some((x) => x.reviewer_kind === "human")
  ).length;
  const duplicates = sources.filter((s) => s.exclusion_code === "E9").length;
  const excluded = sources.filter(
    (s) => s.stage1_verdict === "exclude" && s.exclusion_code !== "E9"
  ).length;

  return (
    <>
      <section className="lead">
        <h2>Literature</h2>
        <p>
          Every record in the register, with both machine readings side by side.
          The filter opens on included records.
        </p>
        <div className="statrow">
          <div className="stat">
            <b>{sources.length}</b>
            <span>records in the register</span>
            <small>
              {sources.length - namedTotal} database, {namedTotal} named sources
            </small>
          </div>
          <div className="stat is-accent">
            <b>{included.length}</b>
            <span>included</span>
            <small>
              {included.length - includedNamed - includedByHuman} by both readings,{" "}
              {includedByHuman ? `${includedByHuman} by a human verdict, ` : ""}
              {includedNamed} named sources after full text
            </small>
          </div>
          <div className="stat is-warn">
            <b>{queue}</b>
            <span>human review required</span>
            <small>the readings split</small>
          </div>
          <div className="stat">
            <b>{excluded}</b>
            <span>excluded</span>
            <small>
              one coded reason each, plus {duplicates} duplicates removed
            </small>
          </div>
        </div>
      </section>

      <div className="cols">
        <aside className="facets">
          <div className="facet">
            <h3>Search</h3>
            <input
              className="search"
              placeholder="Title, author, venue, full abstract…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {renderFacet(allFacets[0])}

          <details className="more">
            <summary>
              More filters
              {activeSecondary ? <span className="n">{activeSecondary} on</span> : null}
            </summary>
            {allFacets.slice(1).map(renderFacet)}
          </details>

          {(Object.keys(selected).length > 0 || q) && (
            <button
              className="reset"
              onClick={() => {
                setSelected({});
                setQ("");
              }}
            >
              Clear all filters
            </button>
          )}
        </aside>

        <main>
          <p className="pnote">
            The list opens on included records. Tick human review required to
            see the splits. A human assigns the verdict on those. Degree of
            uplift is not a reason to exclude.
          </p>
          <div className="resbar">
            <span>
              {results.length} of {sources.length} records
            </span>
            <span className="dlgroup">
              <span className="dlnote">
                Export {included.length} included and {queue} requiring human review, with verdicts
              </span>
              <a className="dl" href="/api/export?format=characteristics-csv">
                Characteristics CSV
              </a>
              <a className="dl" href="/api/export?format=ris">
                RIS
              </a>
            </span>
          </div>

          {results.length === 0 ? (
            <div className="empty">No records match these filters.</div>
          ) : (
            <div className="list">
              {results.map((s) => {
                const verdict = s.stage1_verdict;
                const a = s.screenings.find((x) => x.reviewer === "Screener A");
                const b = s.screenings.find((x) => x.reviewer === "Screener B");
                const humans = s.screenings.filter((x) => x.reviewer_kind === "human");
                return (
                  <article
                    className={`card${verdict === "exclude" ? " is-excluded" : ""}${verdict === "adjudicate" ? " is-queue" : ""}`}
                    key={s.id}
                  >
                    <div className="card-top">
                      <div style={{ minWidth: 0 }}>
                        <h2>
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.title}
                          </a>
                        </h2>
                        <p className="cite">
                          {s.authors} · {s.year} · {s.venue} · {s.source_type} ·{" "}
                          {curated(s)
                            ? "Named source"
                            : `${s.database_name === s.venue ? "" : `${s.database_name} · `}${s.query_id}`}
                        </p>
                      </div>
                      <span className={`verdict v-${verdict}`}>
                        {verdict === "exclude"
                          ? `${s.exclusion_code ?? ""} ${s.exclusion_reason ?? ""}`
                          : VERDICT_LABEL[verdict] ?? verdict}
                      </span>
                    </div>

                    <div className="screenpair">
                      {[a, b].map((sc, i) =>
                        sc ? (
                          <div className={`sc${sc.verdict === "include" ? " in" : " out"}`} key={i}>
                            <b>
                              {sc.reviewer.replace("Screener", "Reading")}
                              <em>{sc.basis}</em>
                            </b>
                            <span className="scv">
                              {sc.verdict}
                              {sc.exclusion_code ? ` · ${sc.exclusion_code}` : ""}
                            </span>
                            {sc.triad ? (
                              <div className="triad">
                                <span className={`leg ${sc.triad.ai ? "on" : "off"}`}>AI</span>
                                <span className={`leg ${sc.triad.harm ? "on" : "off"}`}>harm</span>
                                <span className={`leg ${sc.triad.connective ? "on" : "off"}`}>
                                  connective
                                </span>
                              </div>
                            ) : null}
                            {sc.matched ? (
                              <p className="matched">
                                {sc.matched.ai.map((t) => (
                                  <em key={`a${t}`} className="t-ai">
                                    {t}
                                  </em>
                                ))}
                                {sc.matched.harm.map((t) => (
                                  <em key={`h${t}`} className="t-harm">
                                    {t}
                                  </em>
                                ))}
                                {sc.matched.connective.map((t) => (
                                  <em key={`c${t}`} className="t-conn">
                                    {t.trim()}
                                  </em>
                                ))}
                              </p>
                            ) : null}
                          </div>
                        ) : null
                      )}
                      {humans.map((h) => (
                        <div className={`sc human${h.verdict === "include" ? " in" : " out"}`} key={h.reviewer}>
                          <b>
                            {h.reviewer}
                            <em>{h.basis}</em>
                          </b>
                          <span className="scv">
                            {h.verdict}
                            {h.exclusion_code ? ` · ${h.exclusion_code}` : ""}
                          </span>
                          {h.note ? <p className="hint">{h.note}</p> : null}
                        </div>
                      ))}
                    </div>

                    {verdict === "adjudicate" ? (
                      <div className="adj">
                        <b>Needs a human verdict.</b> Reading A found all three legs across
                        the title and abstract. Reading B found no single sentence that
                        asserts the connection. Read the abstract and decide.
                      </div>
                    ) : null}

                    <button className="link" onClick={() => setOpen(open === s.id ? null : s.id)}>
                      {open === s.id ? "Hide" : "Show"}{" "}
                      {s.abstract ? "abstract and metadata" : "reviewer note and metadata"}
                    </button>

                    {open === s.id ? (
                      <div className="detail">
                        {s.abstract ? (
                          <>
                            <h4>Abstract, as retrieved</h4>
                            <p className="abs">{s.abstract}</p>
                          </>
                        ) : (
                          <>
                            <h4>Reviewer note</h4>
                            <p className="abs">{s.reviewer_note}</p>
                            <p className="hint">
                              {s.abstract_status}. No machine-readable abstract was retrieved
                              for this source.
                            </p>
                          </>
                        )}

                        <h4>Graded metadata. Recorded, never used to exclude</h4>
                        <dl className="meta">
                          <div>
                            <dt>AI role</dt>
                            <dd>{s.grade.aiRole ?? "unrecorded"}</dd>
                          </div>
                          <div>
                            <dt>AI class</dt>
                            <dd>{(s.grade.aiClass ?? []).join(", ") || "unrecorded"}</dd>
                          </div>
                          <div>
                            <dt>Mechanism</dt>
                            <dd>{(s.grade.mechanisms ?? []).join(", ") || "unrecorded"}</dd>
                          </div>
                          <div>
                            <dt>Evidence</dt>
                            <dd>{s.grade.evidence ?? "unrecorded"}</dd>
                          </div>
                          <div>
                            <dt>Intent</dt>
                            <dd>{s.grade.intent ?? "unrecorded"}</dd>
                          </div>
                          <div>
                            <dt>DOI</dt>
                            <dd>{s.doi ?? "none recorded"}</dd>
                          </div>
                        </dl>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
