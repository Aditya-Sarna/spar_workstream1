# Workstream 1 implementation protocol

This file is the source of truth for eligibility, search as run, screening, and
what a later extraction pass is allowed to read. The site publishes it at
/implementation and reports the same rules and counts on the Protocol tab. The
pipeline scripts implement it. If they disagree, this file wins and the others
are updated.

Retrieval date: 2026-09-29. Screening pass regenerated: 2026-09-29.

## Status of this pass

Done:

- Database search on arXiv and OpenAlex, fifteen strings, 40-record cap per call.
- Named-source list of 19 reports, of which 3 were already in the database hits.
- Title and abstract screening of 554 unique database records by two machine
  readings of the triad (document-level and sentence-level).
- Coded exclusions for the 485 records both readings rejected.
- Working corpus of 29 unique sources: 17 database records both readings
  included, plus 12 unique named sources included after a reviewer read the
  full text offline.

Not done, and not claimed:

- Dual independent *human* screening.
- Human adjudication of the 52 records the two readings split on.
- Full text in hand for the 17 database includes.
- Citation chasing, Scopus, Web of Science, PubMed, or any database beyond
  arXiv and OpenAlex.
- Protocol registration (OSF).
- A frozen corpus. The 29 are a working set.

The Literature tab shows the records marked human review required. The site
takes no input. Agreed human verdicts are recorded by the maintainer in a local
checkout (`POST /api/screen`). A recorded human verdict is the authority for
that record; the machine readings stay on the record beside it.

## The instrument

A source is in when it asserts all three legs. Eligibility turns on presence,
never degree.

| Leg | Test |
|-----|------|
| AI element | Does the source name a model, system, tool, or automated capability? |
| Biological harm outcome | Does the source name a biological harm, realised, attempted, or hypothesised? A harm word that does not say what kind (misuse, malicious, catastrophic, dual-use) counts only alongside biological vocabulary in the same scope. Otherwise the harm is out of scope, not absent. |
| Connective | Does the source supply a mechanism, sequence, causal claim, or condition linking the two? |

Degree of uplift, evidence quality, pathway completeness, and whether an actor
is named are recorded after inclusion. They are never exclusion reasons.

## Two readings, not two people

The protocol requires two independent human screeners. This pass has not done
that. It ran two machine operationalisations so the records that depend on how
"asserts" is read are sitting in a queue for a human.

- Reading A: the three legs may be satisfied anywhere in title plus abstract.
- Reading B: all three legs must be satisfied inside one sentence.

B is strictly inside A. Every disagreement in this pass ran A-include,
B-exclude (41 records). Cohen's kappa between them is 0.37. That number
measures the strictness gap, not inter-rater reliability. Do not report it as
reliability.

A record both readings include goes to the working corpus at title and
abstract. A record they split on stays in screening until a human reads it. A
record they both reject is out, with one code from the rule below.

## Inclusion, by stage

Title and abstract (applied to the 554):

| ID | Criterion |
|----|-----------|
| I1 | Names an AI element: a model, system, tool, or automated capability. |
| I2 | Names a biological harm outcome. Generic harm words satisfy I2 only with biological vocabulary in the same scope. |
| I3 | Supplies a connective linking the two. |
| I4 | Publicly available, in English, published 2017 onward. |
| I5 | Carries its own argument rather than only reporting another source's. |

Full text (not yet applied to the 17 database includes):

| ID | Criterion |
|----|-----------|
| I6 | Full text is in hand, so every extracted pathway can be checked against it. |

The 12 included named sources were read in full text by a reviewer. The
machine-readable abstract is not held for those 12. Extraction from them waits
on a text file, not on the verdict.

## Exclusion codes

One code per dropped record. The coder assigns the *clean single-leg failure*
when that pattern is the only failure. Everything else is E4. This is not
"first in ID order."

| Code | When it fires |
|------|----------------|
| E1 | AI and connective present. No biological harm. Capability paper. |
| E2 | Harm and connective present. No AI. Conventional biosecurity. |
| E3 | AI and biological harm present. No connective. Assertion, not a pathway. |
| E4 | Residual. At most one triad leg is present, so a single-leg code does not apply. |
| E5 | AI and connective present. The only harm named is not biological. |
| E6 | Not a source: editorial, news, blog, press release. Full-text code. Unused at title and abstract. |
| E7 | Full text unobtainable. Full-text code. Unused until I6 is applied. |
| E8 | Published before 2017. Harvest already filtered this. Count is zero in the 554. |
| E9 | The same document reached the corpus twice. The harvested copy is kept when it carries the abstract and both readings. |

This pass, database records: E1 137, E2 28, E3 25, E4 280, E5 15. Named-source
unique exclusions: E1 2, E2 1, E5 1. Named-source duplicates coded E9: 3,
removed at identification, not counted again as exclusions.

## Harm vocabulary

Tier 1 (counts alone): biological weapon, bioweapon, biological warfare,
bioterror, biothreat, biological threat, biological attack, biological misuse,
biosecurity risk, pandemic pathogen, gain-of-function, gain of function,
select agent, mass casualty, biological agent.

Tier 2 (counts only with a biological anchor in the same scope): misuse,
malicious, catastrophic, dual-use, dual use, threat actor, weaponisation,
weaponization, weaponise, weaponize.

Biological anchor: word-boundary stems (biolog, pathogen, virus, …) and whole
words (dna, rna, gene, genes). Not the bare word `agent`. Biological senses of
agent are phrases: biological agent, select agent, pathogenic agent.

Implemented in `scripts/lib.mjs` (`BIO_ANCHOR`) and `scripts/screen.mjs`
(`harmIn`).

## Search as run

Databases: arXiv and OpenAlex only. Date: 2026-09-29. Cap: 40 records per
query per database. OpenAlex hits without a usable abstract were dropped
before the identified count. 723 is records retrieved with text, not the
databases' full yield. 15 queries × 2 databases = 30 calls. All 30 returned.

Dedup among database hits: DOI first, then normalised title. First query in
Q1 to Q15 order keeps the record. That is why Identified and Retained after
dedup differ.

Named sources are a list, not a query. The Retained after dedup cell for NS
is 19: every named-source row in the register, including 3 E9 duplicates and
4 exclusions. Unique named sources added: 16. Unique named sources included: 12.

Q10's string is `autonomous` AND `laboratory` AND `chemical safety`. The
concept label matches that string. It is how chemistry papers entered the 554.
They are excluded at screening when they fail the biological-harm leg.

Q11–Q15 were added on 2026-09-29 to raise recall on bioterrorism,
gain-of-function, synthetic biology, DNA synthesis, and red-teaming, still
inside the same AI × biological-harm scope.

Citation chasing, Scopus, Web of Science, PubMed, IEEE, ACM, bioRxiv, and
Google Scholar were not run. They remain open methods, not silent omissions.

## Pipeline

| Step | Script | Output | What it is allowed to do |
|------|--------|--------|---------------------------|
| Retrieve | `scripts/harvest.mjs` | `data/records.json` | Fetch. No eligibility judgement. |
| Screen | `scripts/screen.mjs` | `data/screening.json` | Apply the two readings and the code rule above. |
| Extract | `scripts/extract.mjs` | `data/scenarios.json` | Read included sources only. Passage must be a verbatim substring of retrieved text. A reviewer note is not a passage. |
| Verify | `scripts/verify.mjs` | `data/verification.json` | Automated definition checks. A human decision is still required. |

`npm run harvest` hits the network and will change the identified set. Do not
run it to refresh screening. Re-screen with `npm run screen` against the
committed `records.json`.

Seed the review database from those JSON files. The app is writable locally
and read-only on Vercel.

## Contract for a later extraction pass

1. Eligible sources are those with `stage1_verdict = include` after human
   adjudication is finished. Until then, extract only from the 26 if you must,
   and treat any scenario from a database include as provisional: I6 has not
   been applied.
2. Never write a `passage` that is not a substring of retrieved source text.
3. Named sources with `abstract_status` saying the full text is held by the
   reviewer and no machine-readable abstract was retrieved are held, not
   extracted.
4. Info-hazard hold: set when one passage names a specific biological agent,
   a specific enhancement, and a route together. Sources here are public; the
   synthesised library is still the sensitive artifact.
5. Criteria changes after this file's date are logged as: date, old rule, new
   rule, rationale, records re-screened. Then re-run `npm run screen` and
   re-seed.

## Open work, in order

1. A human reads the 41-record queue and records include or a coded exclude.
2. Retrieve full text for every remaining include, then apply I6.
3. A second human screens a sample (pilot: 25 records, target 75% agreement
   on the in/out decision) before anyone calls the screen dual-independent.
4. Backward and forward citation chase on the included set; additions re-enter
   this protocol.
5. Register the protocol on OSF once the human screen has started, not before.
6. Freeze the corpus. Only then is extraction a result rather than a draft.
