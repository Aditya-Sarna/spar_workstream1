# Literature: Workstream 1

Working review instrument for the AI-enabled biological misuse scoping review.
The protocol this app implements is [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md).

| Workstream step | What the app does |
| --- | --- |
| **Step 1** Systematic literature review | Fifteen search strings on arXiv and OpenAlex, dedup on DOI then title, two machine readings of the triad, disagreements in a human queue. |
| **Step 2** LLM-assisted scenario extraction | Emits one record per candidate scenario with extraction type (direct or inferred), the source passage, the reasoning for classifying it as a scenario, and whether the account is partial or complete. Logs the run for reproducibility. |
| **Step 3** Two-stage verification | Track 1 checks every scenario against its source text and the four requirements of the scenario definition, then queues it for human review. Track 2 codes a seeded random subset independently and reports coverage. |

## Running it

```bash
npm install
npm run pipeline     # harvest -> screen -> extract -> verify
npm run build && npm start
```

The pipeline takes about a minute, most of it rate-limited API calls.

## The pipeline

Four stages, deliberately separate, because PRISMA needs records identified,
deduplicated, screened, and included to be four different numbers rather than one.

```
scripts/harvest.mjs   ->  data/records.json       retrieval only, no judgement
scripts/screen.mjs    ->  data/screening.json     two screeners + kappa
scripts/extract.mjs   ->  data/scenarios.json     scenarios + run log
scripts/verify.mjs    ->  data/verification.json  both verification tracks
```

Run them individually with `npm run harvest`, `screen`, `extract`, `verify`.

SQLite at `data/review.db` is the source of truth for **review decisions**. The JSON
files are inputs: seeding only ever inserts, keyed on id, so regenerating the
pipeline never destroys a decision a reviewer recorded. `npm run reset-db` clears
decisions and reseeds from the JSON.

## Two things in here are stand-ins, and both are labelled in the UI

**The extractor is a deterministic ruleset, not an LLM.** It exists so the whole
chain runs end to end and every number downstream is auditable. What is
production-ready is the logging schema and the verification machinery around it.
Swapping the LLM in means replacing `extractFrom` in `scripts/extract.mjs` and
writing the real model id, prompt, and temperature into the three run-log fields
that currently read `null`. Nothing else changes, including the verification.

**Screeners A and B, and blind coder 2, are automated.** They are not variants of
each other — each operationalises the criterion differently:

- **Screener A** document-level co-occurrence: the triad may be satisfied anywhere
  in the title or abstract.
- **Screener B** sentence-level co-occurrence: the connection must be asserted
  inside one sentence.
- **Blind coder 2** paragraph-level, different causal vocabulary, and it draws the
  AI element from the source's subject the way a human reading for an account uses
  the paper's context rather than sentence-local cues.

Because B's rule is strictly stricter than A's, their disagreements run in one
direction only, and the app says so on the kappa table: kappa between nested rules
measures the strictness gap between two operationalisations, not inter-rater
reliability. A human who screens records in the app appears in that table with no
code change, which is the reason screenings are stored one row per reviewer per
record instead of one verdict per record.

## The passage honesty constraint

Every `passage` in the library is an exact substring of text actually retrieved
from a source API, and `verify.mjs` re-checks each one against the stored abstract.
This is not decoration — it caught a real bug during development, where two
distinct papers collided on the same generated id and passages were being checked
against the wrong abstract.

The same constraint is why the 15 eligible hand-read sources are **not** extracted.
The only text stored for them is the reviewer's own note, and emitting that as a
`passage` would put paraphrase where the schema promises quotation. They sit in the
register with `extraction_status = pending-full-text` and a reviewer scenario
estimate that is labelled an estimate everywhere it appears.

## What the current numbers mean

- Extraction ran on **titles and abstracts only**, so almost every account is
  partial. That is a finding about abstract-level extraction, not a defect: an
  abstract rarely names an intent, a route to capability, and a route to harm in one
  breath. Partial accounts stay in the library as causal fragments for Workstream 2.
- The full-text eligibility stage has **not been done**, so it reports no exclusions
  of its own and the flow figure is a review in progress.
- **No scenario is verified.** Passing the automated checks is a precondition for
  review, not a substitute, so every scenario reads as unverified until a named
  reviewer records a decision.

## Exports

| Route | Contents |
| --- | --- |
| `/api/export?format=scenarios-csv` | The scenario library, one row per scenario |
| `/api/export?format=characteristics-csv` | PRISMA-ScR item 17 characteristics table |
| `/api/export?format=ris` | The corpus for Zotero or EndNote |
| `/api/export?format=protocol-json` | Full audit trail: flow, agreement, coverage, run log |

## Deploying

```bash
npx vercel --prod
```

Serverless filesystems are read-only, so a deployed instance browses the register
and library with every number live but refuses writes, and says so in the header
rather than accepting decisions into a filesystem that will be discarded. Screening
and verification happen in a local checkout.

Criteria, search strategy, and the PRISMA-ScR item mapping live in the
`aixbio-scoping-review` skill at the repository root.
