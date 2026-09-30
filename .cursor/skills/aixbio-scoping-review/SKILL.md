---
name: aixbio-scoping-review
description: Build and document a PRISMA-ScR scoping review corpus on AI-enabled biological misuse, including search strings, named grey-literature sources, eligibility criteria, screening procedure, and flow-diagram reporting. Use when constructing the Workstream 1 literature corpus, drafting or revising the review protocol, writing search terms, deciding whether a source is eligible, screening records, or reporting review counts.
disable-model-invocation: true
---

# AI × Bio Scoping Review

Builds the corpus that feeds LLM-assisted scenario extraction. The corpus must be
reproducible: a second team running this protocol should return substantially the
same source set.

## Core rule: eligibility tests one relation

A source is eligible when it asserts a causal relation between an AI capability and
a biological harm outcome. That relation has three legs:

| Leg | What it is |
|-----|-----------|
| AI element | A named AI system, model, or tool |
| Harm outcome | Biological misuse, weaponization, or dual-use damage |
| Connective | A mechanism, event sequence, dependency, or condition linking them |

All three present → include. Any leg missing → exclude, and name which leg:

- Missing harm → capability or research paper
- Missing AI → conventional biosecurity
- Missing connective → assertion, not a pathway

This is deliberately a test of **presence**, not of **degree**. A thin claim and a
fully specified pathway both pass. Strength, completeness, evidence status, and
originality are recorded as metadata after inclusion, never used to exclude. This
is what keeps inter-reviewer agreement high: reviewers judge whether something is
there, not how much it matters.

The same triad is the scenario definition applied at passage level. So the corpus
is by construction the set of sources containing at least one candidate scenario,
and there is only one instrument to maintain.

### The triad has two operationalisations, and the choice is consequential

"Asserts a relation" can mean *anywhere in the source* or *within one sentence*.
These are not equivalent, and running both against the same 395 records put 39 of
them — about two thirds of everything the looser rule admits — in disagreement. The
connection is stated across sentences but never in one place.

Pick one and write it into the protocol before screening. Whichever is picked, the
other is worth running as the second screener, because the disagreement set is
exactly the set of records that need a human. Note that when one rule is strictly
stricter than the other, kappa between them measures the strictness gap rather than
inter-rater reliability; see [prisma-scr.md](prisma-scr.md).

### Never emit a passage you did not read

Every stored passage must be a verbatim substring of retrieved source text, checked
mechanically. A reviewer's summary of a source is not a quotation and must never be
written into a `passage` field — if the only text held for a source is a reviewer
note, the source is held for a full-text pass, not extracted. The check is cheap and
it catches real errors: in this project it caught two sources colliding on the same
generated id, which had silently been verifying passages against the wrong abstract.

## Workflow

```
Protocol Progress:
- [x] Step 1: Write eligibility and search as run (not yet OSF-registered)
- [x] Step 2: Ten strings on arXiv and OpenAlex, 40-record cap, 2026-09-25
- [x] Step 3: 470 identified with text; 19 named sources
- [x] Step 4: Dedup DOI then title, first-query-wins; 395 unique database records
- [x] Step 5: Two machine readings of the triad (not a human 25-record pilot)
- [ ] Step 6: Human adjudication of the 41 splits; second human on a sample
- [ ] Step 7: Citation chase included sources, re-screen additions
- [ ] Step 8: Full text for the 14 database includes; freeze corpus
```

The working set is 26 unique sources. It is not a frozen corpus. Extraction
from it is provisional until I6 is applied and the queue is cleared. See
[`corpus-explorer/docs/IMPLEMENTATION.md`](../../corpus-explorer/docs/IMPLEMENTATION.md).

### Step 1: Protocol

Write the scope limits and eligibility criteria before any screening. Register on OSF
(PROSPERO does not accept scoping reviews). See [eligibility.md](eligibility.md)
for the full criteria set.

### Step 2-3: Search

Use the three-block Boolean pattern: `(AI terms) AND (biology terms) AND (harm terms)`,
plus a two-block variant for precision-limited databases. Grey literature requires
a named source list, not database queries. See
[search-strategy.md](search-strategy.md) for full strings, database list, and the
named institutional and AI-lab sources.

Record for every source: name, interface, date searched, string used verbatim,
records returned.

### Step 5-6: Screening

This pass used two machine operationalisations (document-level and
sentence-level), not two humans. Log exactly one exclusion reason per dropped
record from [eligibility.md](eligibility.md). The coder assigns the clean
single-leg failure; the residual is E4.

A human now reads the disagreement queue. A second human on a 25-record sample,
target 75% agreement, is what would make the screen dual-independent. Until
that happens, do not report independent human screeners.

### Step 8: Reporting

Emit a PRISMA-ScR flow diagram with counts at every stage and a characteristics
table for included sources. See [prisma-scr.md](prisma-scr.md) for the checklist
items this project must satisfy and the flow-diagram template.

## Metadata recorded on every included source

Never gate on these. Record them so later workstreams can weight evidence.

| Field | Values |
|-------|--------|
| AI role strength | present / assisting / load-bearing |
| AI system class | LLM / biological design tool / bio foundation model / agent or lab automation / multiple |
| Pathway completeness | partial / complete |
| Evidence status | asserted only / red-team or uplift evidence / empirical result |
| Claimed mechanism | lowers barrier / increases access / raises ceiling of harm / none claimed |
| Pathway lineage | original to this source / inherited from [source ID] |
| Intent framing | deliberate / reckless / accidental / unspecified |
| Source type | peer-reviewed / preprint / government / institutional / AI-lab evaluation / red-team study |

`Pathway lineage` cannot be assigned reliably at screening time; assign it during
extraction, once earlier sources have been read. Deduplication of *pathways* is an
extraction-stage pass. Deduplication of *records* happens at Step 4, on **DOI first
and then title** — DOI matching caught 42 duplicate pairs here that title matching
alone missed, mostly preprints whose titles were reworded for the journal.

## Metadata recorded on every extracted scenario

Distinct from the source-level table above, and required by Step 2.

| Field | Values |
|-------|--------|
| Extraction type | direct (stated in one passage) / inferred (assembled by the reader) |
| Source passage | verbatim substring of retrieved text, mechanically verified |
| Reasoning | why this passage meets the scenario definition, naming the causal element |
| Causal element | sequence of events / mechanism / causal relationship / condition leading to outcome |
| Partial or complete | complete when the account touches intent, capability, and harm |
| Inference strength | adjacent / near / distant — how far apart the joined passages sit |
| Info-hazard hold | set when one passage names a specific agent, a specific enhancement, and a route together |

`Inference strength` is the triage field. An inference joining adjacent sentences is
usually sound; one spanning several is where unrelated statements get combined into
something that reads like an account, so review those first.

## Anti-patterns

- Adjudicating whether something is "truly AI-enabled" at the gate. The term has no
  settled definition in this literature; test the triad instead.
- Letting interesting scenarios pull sources into the corpus after extraction has
  started. This is the selection bias the protocol exists to prevent.
- Treating "publicly available sources" as a reason to skip info-hazard handling.
  The synthesized library, not any single PDF, is the sensitive artifact.
- Screening alone. Single-reviewer screening is not auditable.
- Unanchored substring matching in eligibility vocabularies. `rna` matches
  "exte**rna**l", "gove**rna**nce" and "alte**rna**tive"; `actor` matches "f**actor**".
  Both silently passed ordinary English as a biological anchor here until the
  patterns were anchored to word boundaries. Test every term list against a list of
  common words before trusting a count produced with it.
- Word-boundary anchoring is not sufficient on its own. `agent` is a correctly
  anchored whole word whose dominant sense in this literature is "AI agent" or
  "cyber agents", so it anchored a cyber-defence paper and an AI-insurance report
  into the included set. Check the dominant sense of each term *in this corpus*, not
  only its spelling, and keep the biological senses as phrases: `biological agent`,
  `select agent`, `pathogenic agent`.
- A flat harm vocabulary. `misuse`, `malicious`, `catastrophic`, `dual-use` and
  `threat actor` appear in almost any AI-risk paper while asserting nothing about
  biology, so on their own they let the harm leg pass on papers about insurance
  tail risk and autonomous cyber threats. Split the list in two: terms that name a
  biological harm on their own, and terms that name a harm without saying what kind.
  The second group counts only alongside biological vocabulary in the same scope the
  screener is reading, and a hit with no biological anchor is an out-of-scope harm
  (E5) rather than an absent one (E1) — the codes say different things and a
  reviewer auditing exclusions needs the distinction.
- Reading a count as a result when the automated pass produced it. An automated
  check can establish that a passage exists and meets the definition's stated
  requirements; it cannot tell whether two unrelated clauses were stapled into
  something that reads like an account.
