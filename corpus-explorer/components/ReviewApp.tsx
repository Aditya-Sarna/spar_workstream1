"use client";

import { useState } from "react";
import ProtocolPanel from "./ProtocolPanel";
import SourceRegister from "./SourceRegister";

type Tab = "protocol" | "sources";

const TABS: { id: Tab; label: string; step: string }[] = [
  { id: "protocol", label: "Protocol", step: "Criteria and search" },
  { id: "sources", label: "Literature", step: "Screening and adjudication" },
];

export default function ReviewApp({
  sources,
  flow,
  searchStrings,
}: {
  sources: any[];
  flow: any;
  searchStrings: any[];
}) {
  const [tab, setTab] = useState<Tab>("protocol");

  return (
    <div className="wrap">
      <header className="masthead">
        <h1>Literature</h1>
        <p className="lede">
          The papers that assert a connection between an AI capability and a biological
          harm outcome, assembled by a protocol-led search. Title and abstract
          screening so far is two machine readings of the triad. A human still
          has to resolve the records those readings split on.
        </p>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? " on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <b>{t.label}</b>
            <span>{t.step}</span>
          </button>
        ))}
      </nav>

      {tab === "protocol" ? (
        <ProtocolPanel
          searchStrings={searchStrings}
          excludedByReason={flow.excludedByReason}
        />
      ) : null}

      {tab === "sources" ? (
        <SourceRegister sources={sources} />
      ) : null}
    </div>
  );
}
