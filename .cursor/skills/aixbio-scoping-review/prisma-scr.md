# PRISMA-ScR Reporting

PRISMA-ScR (Tricco et al. 2018, *Ann Intern Med* 169(7):467-473) is a **reporting**
standard: 20 essential items plus 2 optional. It does not supply a search strategy.
It specifies what must be documented so a reader can reconstruct the review.

## Items this project must satisfy

| Item | Requirement | Where it comes from here |
|------|-------------|--------------------------|
| 1 | Identify the report as a scoping review | Title |
| 2 | Structured summary | Abstract: objectives, eligibility, sources, charting, results |
| 3-4 | Rationale and explicit objectives | Why a scoping review; the review question and its scope limits |
| 5 | Protocol existence, access, registration | Implementation protocol in corpus-explorer/docs/IMPLEMENTATION.md. OSF not yet filed. |
| 6 | Eligibility criteria with rationale | [eligibility.md](eligibility.md), including date and language rationale |
| 7 | All information sources, with dates of coverage and date last searched | Database table and named grey-literature list |
| 8 | Full electronic search strategy for at least one database, repeatable | The ten arXiv and OpenAlex strings, verbatim, on the protocol page |
| 9 | Selection process | Two machine readings plus a human queue. Dual independent human screening is open work. |
| 10 | Data charting method, whether done in duplicate | The extraction schema and its piloting |
| 11 | Data items: every variable sought, with assumptions | Metadata field table with permitted values |
| 12 | Critical appraisal | Optional for scoping reviews. State that it was not performed and why: the review maps asserted pathways, it does not assess their validity. |
| 13-14 | Synthesis method; selection results | Counts at every stage |
| 15 | Characteristics of sources | Characteristics table |
| 17 | Numbers screened, assessed, included, with reasons for exclusion | Flow diagram with coded reasons |
| 18-19 | Results and summary of evidence | Corpus description |
| 20 | Limitations | English-only, 2017 cutoff, public sources only, grey-literature discoverability |
| 21-22 | Conclusions and funding | — |

Items 12 and 19 (critical appraisal) are optional in PRISMA-ScR precisely because
scoping reviews admit non-research sources. State the decision explicitly rather
than omitting it silently.

## Flow diagram template

Fill every bracket. Reasons at the full-text stage use the coded reasons from
[eligibility.md](eligibility.md).

```
IDENTIFICATION
  Records from databases                              n = [ ]
    arXiv [76]  OpenAlex [394]
    Not run: Scopus, Web of Science, PubMed, IEEE, ACM, bioRxiv, Google Scholar
  Records from other methods                          n = [ ]
    Named grey-literature sources [ ]
    Backward citation chasing [ ]
    Forward citation chasing [ ]
    Hand-search [ ]

  Duplicates removed                                  n = [ ]

SCREENING
  Records screened on title and abstract              n = [ ]
  Records excluded                                    n = [ ]
    Capability paper (E1) [ ]
    Conventional biosecurity (E2) [ ]
    Assertion, not a pathway (E3) [ ]
    Residual, at most one leg (E4) [ ]
    Out of scope harm (E5) [ ]
    Not citable (E6) [ ]
    Outside limits (E8) [ ]

  Full texts sought                                   n = [ ]
  Full texts not retrieved                            n = [ ]
  Full texts assessed                                 n = [ ]
  Full texts excluded                                 n = [ ]
    [same coded reasons, plus Not auditable (E7), Duplicate (E9)]

INCLUDED
  Sources in frozen corpus                            n = [ ]
```

## Characteristics table columns

One row per included source:

`ID | citation | source type | year | AI system class | AI role strength |
claimed mechanism | intent framing | evidence status | candidate scenarios (n)`

## Reporting the agreement statistics

Report, for each screening pass: number of records double-screened, percent
agreement, Cohen's kappa, and number of tie-breaks. Report the pilot separately
from the main screen. A single agreement figure covering both conceals whether the
criteria were stable before screening began.

Three things about kappa that matter more than the coefficient:

**Report the 2×2 cells, not only kappa.** Both-include, A-only, B-only, both-exclude.
Kappa is uninterpretable without them, because a high base rate of exclusions
depresses it regardless of how well the reviewers agree. Here 90.1% raw agreement
came with κ = 0.44, purely because 338 of 395 records were excluded by both.

**Check whether disagreement runs both ways.** If one reviewer's misses are a strict
subset of the other's, kappa is measuring how much stricter one rule is, not whether
two judgements converge. That is a real finding about the instrument, and it should
be labelled rather than reported as reliability. Two humans disagree in both
directions; a stricter rule versus a looser one does not.

**Report agreement on the exclusion reason separately.** Two reviewers agreeing a
record is out while disagreeing why is a codebook problem, not a screening problem,
and it needs a different fix. In this corpus reason-agreement was 82.0% among the
jointly excluded, against 90.1% agreement on the in/out decision itself.

## Reporting coverage, and choosing the sampling rate

The second verification track characterises coverage; it does not establish ground
truth, so do not report it as accuracy or precision. Report recall of the extraction
pass against the independent coding, and list every missed account in full — a
coverage gap is only actionable if a reader can see what was missed.

Choose the sampling rate from evidence rather than convention. Computing the same
coverage figure on the full set and on the proposed subsample shows what the rate
costs: here the full set gave 27.0% recall over 37 independently identified accounts,
while a 20% subsample contained a single account and would have reported 0%. At that
corpus size the conventional rate cannot estimate coverage at all, which is an
argument either for sampling far more heavily or for spending the human effort on
adjudication instead.

## Protocol deviations

PRISMA-ScR expects deviations to be transparent, and scoping reviews are explicitly
iterative, so deviations are normal rather than a failure. Maintain a table:

`date | item changed | old rule | new rule | rationale | records re-screened`
