"use client";

import {
  TRIAD,
  EXCLUSION_CODES,
  TITLE_ABSTRACT_INCLUSION,
} from "@/lib/criteria";

type SearchString = {
  id: string;
  label: string;
  string: string;
  sources: string;
  identified: number | null;
  retained: number;
};

export default function ProtocolPanel({
  searchStrings,
  excludedByReason,
}: {
  searchStrings: SearchString[];
  excludedByReason: Record<string, number>;
}) {
  return (
    <>
      <section className="lead">
        <h2>The review protocol</h2>
        <p className="pnote">
          Source of truth: the{" "}
          <a href="/implementation">written implementation protocol</a>. This page
          reports the same rules, and its counts are read live from the review
          database.
        </p>
        <nav className="jump">
          <a href="#eligibility">Eligibility</a>
          <a href="#search">Search strings</a>
        </nav>
      </section>

      <section className="panel-open" id="eligibility">
        <h3>Eligibility: one substantive test</h3>
        <table className="terms">
          <thead>
            <tr>
              <th>Leg</th>
              <th>Test</th>
            </tr>
          </thead>
          <tbody>
            {TRIAD.map((t) => (
              <tr key={t.leg}>
                <td>
                  <b>{t.leg}</b>
                </td>
                <td>{t.test}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>Title and abstract: all five must hold</h4>
        <ul className="crit">
          {TITLE_ABSTRACT_INCLUSION.map((c) => (
            <li key={c.id}>
              <code>{c.id}</code> {c.text}
            </li>
          ))}
        </ul>

        <h4>Exclusion: one coded reason per dropped record</h4>
        <p className="pnote">
          The coder assigns the clean single-leg failure when that is the only
          failure. Everything else is E4. This is not first-in-ID-order.
        </p>
        <ul className="crit">
          {Object.entries(EXCLUSION_CODES).map(([code, entry]) => (
            <li key={code}>
              <code>{code}</code> {entry.label}. {entry.text}
              {excludedByReason[code] ? (
                <span className="tally">
                  {excludedByReason[code]} record{excludedByReason[code] === 1 ? "" : "s"}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-open" id="search">
        <h3>Search strings, as run</h3>
        <table className="terms">
          <thead>
            <tr>
              <th>ID</th>
              <th>Concept</th>
              <th>String</th>
              <th className="num">Identified</th>
              <th className="num">Retained after dedup</th>
            </tr>
          </thead>
          <tbody>
            {searchStrings.map((s) => (
              <tr key={s.id}>
                <td>
                  <code>{s.id}</code>
                </td>
                <td>{s.label}</td>
                <td className="mono">{s.string}</td>
                <td className="num">{s.identified ?? "n/a"}</td>
                <td className="num">{s.retained}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
