# Search Strategy

**As run, 2026-09-29.** arXiv and OpenAlex only. Fifteen strings in
`corpus-explorer/scripts/harvest.mjs`. Cap 40 per query per database. Named
list of 19 sources. The other databases and citation chasing below are the
intended expansion, not what this pass did. See
[`corpus-explorer/docs/IMPLEMENTATION.md`](../../corpus-explorer/docs/IMPLEMENTATION.md).

## Three-block Boolean pattern

Full recall version, for databases supporting long queries (Scopus, Web of Science):

```
(A: AI) AND (B: biology) AND (C: harm)
```

Precision-limited version, for interfaces with query length caps or low-yield
corpora (arXiv, bioRxiv, institutional site search): drop block C and screen
manually. Block C raises precision but drops sources that describe a pathway
without using explicit harm vocabulary.

## Block A — AI terms

```
"artificial intelligence" OR "machine learning" OR "deep learning"
OR "large language model*" OR LLM OR "foundation model*" OR "frontier model*"
OR "generative AI" OR chatbot OR GPT OR "reasoning model*"
OR "biological design tool*" OR BDT OR "protein design" OR "protein language model*"
OR "biological foundation model*" OR "bio foundation model*" OR "sequence model*"
OR "AI agent*" OR "autonomous agent*" OR "autonomous science"
OR "lab automation" OR "cloud lab*" OR "self-driving lab*" OR "robotic lab*"
OR AlphaFold OR RFdiffusion OR ProGen OR ESMFold
```

## Block B — biology terms

```
biosecurity OR biosafety OR "biological weapon*" OR bioweapon* OR "biological warfare"
OR bioterror* OR "biological agent*" OR pathogen* OR virus OR viral OR toxin*
OR "select agent*" OR "dual-use" OR "dual use" OR DURC
OR "gain-of-function" OR "gain of function" OR "synthetic biology"
OR "nucleic acid synthesis" OR "DNA synthesis" OR "gene synthesis" OR "benchtop synthesi*"
OR "pandemic pathogen*" OR "potential pandemic pathogen*" OR PPP
OR "life science*" OR bioengineering
```

## Block C — harm and misuse terms

```
misuse OR malicious OR "threat actor*" OR adversar* OR weaponi* OR proliferation
OR uplift OR "barrier to entry" OR "lower* barrier*" OR "ceiling of harm"
OR attack OR acquisition OR "capability of concern" OR "capabilit* of concern"
OR "red team*" OR redteam* OR jailbreak* OR safeguard* OR "model evaluation*"
OR "risk assessment" OR "information hazard*" OR infohazard*
```

## Databases

Run in each, record interface and date searched:

| Source | Notes |
|--------|-------|
| Scopus | Primary. Use TITLE-ABS-KEY. Full three-block string. |
| Web of Science Core Collection | Primary. Topic search. |
| PubMed | Use MeSH where available: Artificial Intelligence, Biosecurity, Bioterrorism. |
| IEEE Xplore | AI venues underindexed elsewhere. |
| ACM Digital Library | FAccT, AIES papers on misuse. |
| arXiv | cs.AI, cs.CY, cs.CL, q-bio. Two-block variant. |
| bioRxiv, medRxiv | Two-block variant. |
| SSRN, OSF Preprints | Policy and governance preprints. |
| Google Scholar | Supplementary only. Screen first 100 results per string; record the cap. |

## Grey literature: named sources

Grey literature will not surface from database queries. Hand-search each site and
publication list. Record date searched per source.

**Research institutes and think tanks**
RAND, Center for Security and Emerging Technology (CSET), Centre for Long-Term
Resilience (CLTR), Nuclear Threat Initiative (NTI | bio), Johns Hopkins Center for
Health Security, Council on Strategic Risks, Federation of American Scientists,
Institute for Progress, Chatham House, Carnegie Endowment, Brookings, GovAI,
Convergence Analysis, SaferAI, Blueprint Biosecurity, SecureBio, IBBIS, RAND Europe.

**Government and intergovernmental**
NASEM consensus reports, US DHS CWMD, NIST and the US AI safety institute lineage,
UK AI Security Institute, UK Government Office for Science, OECD, WHO, BWC
meeting documents, EU AI Act GPAI Code of Practice materials, International AI
Safety Report.

**AI developer publications**
System cards, model cards, preparedness and frontier-safety framework reports, and
CBRN evaluation write-ups from: OpenAI, Anthropic, Google DeepMind, Meta,
Microsoft, xAI, Mistral, Cohere, AI21, DeepSeek, Alibaba. Also third-party
evaluators: METR, Apollo Research, Epoch AI.

**Evaluation and red-team artifacts**
Published uplift studies, red-team reports, and benchmark papers where the
benchmark targets biological capability. Include the benchmark paper only if it
asserts a pathway; otherwise it is a capability paper and fails the triad.

## Supplementary methods

1. **Backward chasing.** Screen reference lists of every included source.
2. **Forward chasing.** Scopus or Google Scholar cited-by on included sources and
   on the field's high-citation anchors.
3. **Hand-search.** Table of contents for journals repeatedly appearing in the
   included set.
4. **Author contact.** Optional, for reports cited but not retrievable.

Additions from chasing re-enter screening under the same criteria. Record them
separately in the flow diagram as identified via other methods.

## Search validation before committing

- **Known-item test.** Assemble 10-15 sources the team already knows belong in the
  corpus. Run the strings. If the search misses any, diagnose which block excluded
  it and revise. Record the test and outcome.
- **Date-limit sensitivity.** Run one string without the date limit. Report how many
  additional records the limit excludes, to justify the cutoff rather than assert it.
- **Yield check.** If a database returns implausibly few records, the string is
  probably malformed for that interface, not the literature.
