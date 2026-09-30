# Eligibility Criteria

Implementation detail and the current counts live in
[`corpus-explorer/docs/IMPLEMENTATION.md`](../../corpus-explorer/docs/IMPLEMENTATION.md).
This file is the short form. If they disagree, the implementation file wins.

## Scope

Eligibility turns on one substantive question, the triad, plus formal limits
so the corpus can be reproduced.

Actor scope is open. Any actor class, any AI system class, any biological
agent class. Absence of a named actor is not grounds for exclusion.

Formal limits: publicly available sources, any country of origin, English,
published 2017 onward. English-only is a resource constraint. 2017 is the
transformer and deep-learning protein-design onset.

## The triad

A source is eligible when all three legs are present:

1. **AI element.** A named model, system, tool, or automated capability.
2. **Biological harm outcome.** A named biological harm, realised, attempted,
   or hypothesised. A harm word that does not say what kind (misuse,
   malicious, catastrophic, dual-use) counts only alongside biological
   vocabulary in the same scope. Otherwise the harm is out of scope (E5), not
   absent (E1).
3. **Connective.** A mechanism, sequence, causal claim, or condition linking
   the two.

Presence, never degree.

## Two readings

"Asserts" can mean anywhere in title plus abstract (reading A) or inside one
sentence (reading B). This pass ran both as programs. B is strictly inside A.
Disagreement is the human queue. Kappa between them is a strictness gap, not
reliability. Dual independent *human* screening is still open work.

## Inclusion, by stage

**Title and abstract**

| ID | Criterion |
|----|-----------|
| I1 | An AI element is named |
| I2 | A biological harm outcome is named, under the generic-word rule above |
| I3 | A connective links them |
| I4 | Public, English, 2017 onward |
| I5 | Carries its own argument |

**Full text**

| ID | Criterion |
|----|-----------|
| I6 | Full text is in hand |

I6 has not been applied to the 14 database includes in the working corpus.

## Exclusion codes

The coder assigns the clean single-leg failure when that is the only failure.
Everything else is E4. This is not first in ID order.

| ID | When it fires | Label |
|----|---------------|-------|
| E1 | AI and connective, no biological harm | Capability paper |
| E2 | Harm and connective, no AI | Conventional biosecurity |
| E3 | AI and biological harm, no connective | Assertion, not a pathway |
| E4 | At most one triad leg present | Residual |
| E5 | AI and connective, harm named is not biological | Out-of-scope harm |
| E6 | Editorial, news, blog, press release | Not a source (full text) |
| E7 | Full text unobtainable | Inaccessible (full text) |
| E8 | Published before 2017 | Out of window |
| E9 | Same document twice | Duplicate (identification) |

E5 mixed-harm sources: include if a biological pathway meeting I1–I3 is
stated. Extract only that pathway.

E9: keep the harvested copy when it carries the abstract and both readings.
Pathway restatement is not E9.

## What is never grounds for exclusion

- The AI's contribution looks thin
- The pathway is partial
- The source asserts the relation without evidencing it
- The source concludes the AI provides no uplift
- The account is speculative
- The pathway appears in other sources already
