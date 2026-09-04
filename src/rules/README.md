# src/rules — the editable brain

Every classification, severity, routing, confidence, evidence and question decision
lives in this folder. Nothing in `screens/` or `components/` decides anything; they
render what the pipeline returns.

Each file opens with a `WHAT THIS DOES / HOW TO CHANGE IT / WHY IT WORKS THIS WAY`
comment. Rules are flat data tables with inline comments, not clever abstractions.
Prefer adding a keyword to an array over writing a regex.

## The pipeline (`pipeline.ts`)

Fixed order. Each step is a pure function of the step before it.

```
raw input
  │
  ├─ 1. normalize()          lowercase copy for matching; original kept for display
  │
  ├─ 2a. rules pass          bucket scores + 7 signals from keyword tables
  ├─ 2b. LLM pass            bucket + signals + evidence (skipped with no key)
  │
  ├─ 3. arbitrate()          merge: bucket by precedence, signals by max severity
  ├─ 4. tiebreaks()          resolve remaining bucket ambiguity by boundary rule
  ├─ 5. impactEscalation()   text may raise the dropdown, never lower it
  ├─ 6. severity()           base grid → floors → silent-failure modifier
  ├─ 7. routing()            bucket → team + escalation actions
  ├─ 8. confidence()         rules-vs-LLM agreement + evidence strength
  ├─ 9. evidence()           verify every span is a real substring; drop the rest
  ├─ 10. questions()         per-bucket bank + conditionals, capped at 5
  └─ 11. secondaryTags()     optional cross-cutting labels
```

**Signal merge rule:** for each of the seven signals, take the more severe of the
rules reading and the LLM reading. Either method can escalate a signal; neither can
suppress the other. Under-triage costs more than over-triage in a system with a human
confirm step.

## The files

| File | Owns |
|---|---|
| `normalize.ts` | text clean-up before matching |
| `buckets.ts` | five bucket definitions, keyword patterns, scoring, precedence |
| `tiebreaks.ts` | ordered boundary rules for when two buckets both score |
| `signals.ts` | keyword tables for the seven severity signals |
| `severity.ts` | base grid, floors, silent modifier — the most important file |
| `impactEscalation.ts` | text can raise the impact dropdown, never silently lower it |
| `routing.ts` | bucket → team + "what to check"; escalation action list |
| `confidence.ts` | High / Medium / Low from cross-checking two methods |
| `evidence.ts` | span extraction + `indexOf` substring guard |
| `questions.ts` | question bank + conditionals |
| `secondaryTags.ts` | data-loss / compliance / latency / regression / single-account / financial |
| `duplicates.ts` | off by default; token-overlap similarity |
| `__tests__/expected.ts` | the answer key: bucket + severity for all 15 seeds + 6 adversarial cases |
| `__tests__/pipeline.test.ts` | runs the real pipeline rules-only and asserts the key |
| `__tests__/holdout.ts` | 30 differently-phrased cases, a generalization guard (Iteration 2) |
| `__tests__/holdout.test.ts` | asserts the rules-only floors: bucket ≥ 22/30, severity ≥ 21/30 |

If the engine disagrees with `expected.ts`, fix the rules, not the test. The hold-out set
is a guide, not an answer key — its test asserts a floor, not per-case results.
