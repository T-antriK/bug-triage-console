# BUILD SPEC — Bug Triage Console

**How to use this file:** paste it into Claude Code as the initial prompt, or drop it in
the repo root and say "Build the app described in BUILD_SPEC.md." Iterate by editing this
file and re-running.

> This file is the single source of truth. It has been updated through **Iteration 5**;
> changes are marked by iteration inline.

---

## 0. Mission and working agreement

Build a local-first internal tool that takes a messy natural-language bug report about a
production voice agent and returns a **recommended** bucket, severity, routing,
confidence, evidence, and next questions. A human confirms before anything is routed.

Rules for how you work:

1. Build in the order of Section 12. Get one milestone fully working before starting the
   next.
2. Do not ask for permission between steps. Make reasonable choices, note them in
   `DECISIONS.md`, keep going.
3. Run the app and verify each milestone yourself before moving on. Fix what is broken.
4. Every constant lives in `src/config.ts`. No magic numbers or strings anywhere else in
   the codebase.
5. Every rule lives in `src/rules/`. No classification or severity logic in components,
   ever.
6. Write rules for a human reader. Each rules file opens with a plain-English comment
   explaining the philosophy and how to change it. Rules are data tables with inline
   comments, not clever abstractions. Prefer a keyword array over a regex. Prefer an
   explicit `if` over a lookup indirection. Someone who does not write TypeScript should
   be able to open `severity.ts` and change a threshold.
7. No `any`. Types live in `src/types.ts`.
8. At the end, write `README.md` (setup, run, how to plug in a key) and `DECISIONS.md`
   (choices made, tradeoffs, what was cut).

---

## 1. Tech stack (locked)

- Vite + React 18 + TypeScript
- React Router for screens
- Plain CSS in `src/styles/` using CSS custom properties. No Tailwind, no component
  library, no CSS-in-JS.
- localStorage only. No backend, no database, no auth.
- Vitest for the rules test suite.
- Zero runtime dependencies beyond React, React Router, and the provider SDK calls
  (which are plain `fetch`, no SDK packages).

Setup must be exactly: `npm install && npm run dev`.

**API key handling.** The key is entered on the start screen and stored in localStorage
under the settings key. Calls go direct from browser to provider. For Anthropic include
the header `anthropic-dangerous-direct-browser-access: true`. Never commit a key. `.env`
is gitignored and unused. Put a short "Security note" section in `README.md` stating:
keys are user-supplied and session-scoped, the app has no server and no shared secret,
rules-only mode requires no key, and a production version would proxy through a backend.

---

## 2. Repo structure

```
bug-triage-console/            (built at the repo root)
├── README.md
├── DECISIONS.md
├── BUILD_SPEC.md
├── package.json
├── index.html
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx                # router + layout shell
│   ├── config.ts              # ALL constants and feature flags
│   ├── types.ts               # all TypeScript types
│   │
│   ├── rules/                 # ── THE EDITABLE BRAIN ──
│   │   ├── README.md          # how the pipeline fits together
│   │   ├── pipeline.ts        # orchestrator: input -> full output
│   │   ├── normalize.ts       # text cleanup before matching
│   │   ├── buckets.ts         # bucket definitions + keyword patterns
│   │   ├── tiebreaks.ts       # ambiguity resolution ladder
│   │   ├── signals.ts         # the 7 severity signals, rules-based
│   │   ├── severity.ts        # base grid + floors + modifier
│   │   ├── impactEscalation.ts# text can raise the dropdown
│   │   ├── routing.ts         # bucket -> team + escalation actions
│   │   ├── confidence.ts      # rules vs LLM arbitration
│   │   ├── evidence.ts        # span extraction + substring guard
│   │   ├── questions.ts       # question bank + conditionals
│   │   ├── secondaryTags.ts   # optional cross-cutting tags
│   │   ├── duplicates.ts      # off by default
│   │   ├── trace.ts           # Iteration 5: explain* functions + buildTrace (verbose only)
│   │   └── __tests__/
│   │       ├── expected.ts    # answer key for the 15 seeds
│   │       ├── pipeline.test.ts
│   │       ├── holdout.ts     # Iteration 2: 30-case generalization set
│   │       ├── holdout.test.ts# Iteration 2: asserts the rules-only floors
│   │       └── trace.test.ts  # Iteration 5: verbose on/off identical, no drift, eviction
│   │
│   ├── llm/
│   │   ├── client.ts          # provider-agnostic fetch wrapper
│   │   ├── providers.ts       # request builders / response parsers by shape
│   │   ├── prompt.ts          # the extraction prompt
│   │   └── parse.ts           # strict JSON parse + validation
│   │
│   ├── store/
│   │   ├── storage.ts         # localStorage read/write + migration + settings (verbose)
│   │   ├── reports.ts         # CRUD + status transitions + reclassifyReport (re-run apply)
│   │   ├── traces.ts          # Iteration 5: decision trace store, 50-cap eviction
│   │   ├── activity.ts        # append-only log
│   │   ├── feedback.ts
│   │   └── seed.ts            # the 15 examples
│   │
│   ├── lib/                   # presentation-only helpers (format, toast, triage wiring)
│   │
│   ├── screens/
│   │   ├── StartScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── ReportForm.tsx     # new + draft + in-review + routed + resolved
│   │   ├── TriageQueue.tsx
│   │   ├── ActivityLog.tsx
│   │   ├── UserGuide.tsx
│   │   ├── Feedback.tsx
│   │   ├── DataFiles.tsx
│   │   └── DataTable.tsx      # generic HTML table view
│   │
│   ├── components/
│   │   ├── ThorHammer.tsx
│   │   ├── SeverityBadge.tsx
│   │   ├── ConfidenceBadge.tsx  # Iteration 2
│   │   ├── DecisionTrace.tsx    # Iteration 5: the collapsed trace section + step details
│   │   ├── TraceDiff.tsx        # Iteration 5: re-run vs. stored comparison
│   │   ├── EvidenceHighlight.tsx
│   │   ├── ReasonChain.tsx
│   │   ├── StatusPill.tsx
│   │   ├── Layout.tsx
│   │   ├── Toast.tsx
│   │   └── Modal.tsx
│   │
│   └── styles/
│       ├── tokens.css
│       ├── base.css
│       └── screens.css
└── public/
    └── guide/                 # screenshot placeholders for User Guide
```

---

## 3. `src/config.ts` — every variable

`src/config.ts` holds all feature flags and constants. The sections below are the ones
that carry business meaning; UI copy, route paths, table column orders and export
delimiters live in a clearly-marked second region of the same file so no literal string
leaks into a component.

### Feature flags

```ts
export const FEATURES = {
  THOR_HAMMER_ENABLED: true,   // the hammer scene on the home screen
  ACTIVITY_LOG_ENABLED: true,  // false = no writes to the log, nav item hidden
  LLM_ENABLED: true,           // false = rules-only, no network calls ever
  SEED_DATA_ENABLED: true,     // load the 15 examples as resolved on first run
  DUPLICATE_DETECTION: false,  // flag near-identical open reports
  EVAL_HARNESS_ENABLED: true,  // "Run all seeds" button in Data Files
} as const;
```

Any single flag can be flipped to `false` and the app still runs, with the layout intact.

### Storage

```ts
export const SCHEMA_VERSION = 5;   // v2 more_info/resolution_note · v3 rules_matched_patterns/
                                   // llm_spans_dropped · v4 import_source · v5 has_trace
export const STORAGE_KEYS = {
  REPORTS:  'triage.reports.v1',
  ACTIVITY: 'triage.activity.v1',
  FEEDBACK: 'triage.feedback.v1',
  SETTINGS: 'triage.settings.v1',
  SESSION:  'triage.session.v1',
  TRACES:   'triage.traces.v1',   // Iteration 5: decision traces, keyed by report id, capped at 50
} as const;
```

Each schema bump ships an idempotent migration in `store/storage.ts` that backfills the
new field(s) on existing records and re-stamps `schema_version`. Nothing is ever wiped or
reseeded — a user with reports in flight keeps them.

**Iteration 2 — schema v1 → v2.** `TriageReport` gains two persisted fields:

```ts
more_info:       string | null;   // free text the user adds after seeing the prompts
resolution_note: string | null;   // mandatory at Mark as resolved
```

`store/storage.ts` runs a migration on load: existing v1 records get `more_info: null`
and `resolution_note: null` and their `schema_version` bumped to 2. Nothing is wiped or
reseeded — a user with reports in flight keeps them. The migration is idempotent and safe
to run against an empty store.

`next_questions` already existed and already persists; Iteration 2 only relabels it in
the UI ("Prompts for more info") — the field name is unchanged.

### LLM providers

**Iteration 2 — four working providers plus rules-only.** `shape` drives which request
builder and response parser `client.ts` uses (`anthropic` | `openai` | `gemini` |
`none`); Kimi is OpenAI-compatible and reuses that pair. `keyHeader` names the header the
key goes in (for `Authorization` the value is `Bearer ${key}`).

```ts
export const LLM_PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    shape: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    modelSuggestions: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
    keyPlaceholder: 'sk-ant-...',
    keyHeader: 'x-api-key',
    extraHeaders: { 'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true' },
  },
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    shape: 'openai',
    defaultModel: 'gpt-4o',
    modelSuggestions: ['gpt-4o', 'gpt-4o-mini'],
    keyPlaceholder: 'sk-...',
    keyHeader: 'Authorization',
    extraHeaders: {},
  },
  gemini: {
    label: 'Google (Gemini)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    shape: 'gemini',
    defaultModel: 'gemini-2.5-flash',
    modelSuggestions: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    keyPlaceholder: 'AIza...',
    keyHeader: 'x-goog-api-key',
    extraHeaders: {},
  },
  kimi: {
    label: 'Moonshot (Kimi)',
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    shape: 'openai',
    defaultModel: 'kimi-k2-0905-preview',
    modelSuggestions: ['kimi-k2-0905-preview', 'moonshot-v1-32k'],
    keyPlaceholder: 'sk-...',
    keyHeader: 'Authorization',
    extraHeaders: {},
  },
  none: {
    label: 'Rules only — no API key needed',
    endpoint: null, shape: 'none', defaultModel: null,
    modelSuggestions: [], keyPlaceholder: '', keyHeader: null, extraHeaders: {},
  },
} as const;

export const LLM_CONFIG = {
  TIMEOUT_MS: 20000, MAX_TOKENS: 1500, TEMPERATURE: 0, MAX_RETRIES: 1,
} as const;
```

The **model field in the UI is editable free text** with a suggestions datalist (not a
locked dropdown), pre-filled with `defaultModel` on provider change. A teammate can type
a model ID that did not exist when this was built.

`client.ts` is refactored around `shape`: three request builders and three response
parsers (`anthropic`, `openai`, `gemini`). Gemini's request uses
`contents: [{ role, parts: [{ text }] }]` + `generationConfig` + `systemInstruction`
rather than `messages`/`max_tokens`, and the response text is at
`candidates[0].content.parts[0].text`.

**CORS handling.** If a `fetch` to a provider throws before any HTTP response comes back
(a CORS rejection, a blocked cross-origin request, an unreachable host), the report falls
back to rules-only, the activity log records `action: 'llm.cors_blocked'`, and the report
surfaces *"[Provider] blocked a direct browser request. This provider may require a
server proxy. Rules-only triage was used for this report."* Got-a-response-but-bad
failures (401, 429, timeout after connect, malformed JSON) still log `llm.failed`.

### Domain vocabulary

```ts
export const IMPACT_OPTIONS  = ['single', 'many', 'outage'] as const;
export const BUCKET_IDS      = ['STT', 'TTS', 'LLM', 'POST_CALL', 'INFRA'] as const;
export const SEVERITY_LEVELS = ['Sev0', 'Sev1', 'Sev2', 'Sev3'] as const;
export const ROUTING_TEAMS   = ['Voice AI', 'Platform/Infra', 'Integrations', 'Other'] as const;
export const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low'] as const;
export const REPORT_STATUSES = ['draft', 'in_review', 'routed', 'resolved', 'discarded'] as const;
```

### Validation

```ts
export const VALIDATION = {
  BUG_REPORT_MIN_CHARS: 10,
  BUG_REPORT_MAX_CHARS: 4000,
  CUSTOMER_MAX_CHARS: 120,
  REASON_MIN_CHARS: 5,             // override reason must say something
  RESOLUTION_MIN_CHARS: 10,        // Iteration 2: resolution note must explain the fix
  MORE_INFO_MAX_CHARS: 4000,       // Iteration 2
  MAX_QUESTIONS_SHOWN: 5,
} as const;

export const ACTIVITY_VALUE_MAX_CHARS = 1000;   // Iteration 2: value_from/value_to cap
export const ACTIVITY_TRUNCATED_MARK  = '…[truncated]';
```

### Thor / UI

```ts
export const THOR = {
  MIN_ATTEMPTS: 2, MAX_ATTEMPTS: 3,
  TOOLTIP: 'Can you pick it up? Click to test your worthiness!',
  FAILURE_MESSAGE: 'Manifest more worthiness and try again!',
  FAILURE_BUTTON: 'OK', DROP_BUTTON_LABEL: 'Drop', LIFT_DURATION_MS: 900,
} as const;

export const UI = {
  START_BLINK_PERIOD_MS: 1400,
  TOAST_DURATION_MS: 3000,
  QUEUE_PAGE_SIZE: 50,
  MORE_INFO_DEBOUNCE_MS: 600,      // Iteration 2
} as const;
```

### Colour tokens

`styles/tokens.css` — `--paper` cool off-white, `--ink`, `--muted`, `--rule`, `--accent`
(interactive only). Severity gets its own scale (`--sev0..3`) used nowhere else.

**Iteration 2 — confidence gets its own scale**, deliberately not the severity colours,
so two coloured badges in adjacent table columns do not read as the same axis:

```css
--conf-high:   #2E7D5B;
--conf-medium: #B07A1E;
--conf-low:    #8A4B3A;
```

---

## 4. Data model — `src/types.ts`

### 4.1 TriageReport

Flat apart from a few JSON-valued fields (evidence spans, questions, tags, reason chain).

```ts
type TriageReport = {
  // identity
  id: string; schema_version: number; created_at: string; updated_at: string;

  // input fields (editable in draft only)
  bug_report: string;
  customer: string;
  call_id: string | null;
  started_at: string | null;   // Iteration 2: date only, 'YYYY-MM-DD', no time anywhere
  impact: 'single' | 'many' | 'outage';

  // computed at submit
  bucket: BucketId;
  secondary_tags: string[];
  severity: SeverityLevel;
  confidence: 'High' | 'Medium' | 'Low';
  routing_suggestion: RoutingTeam;
  evidence: EvidenceSpan[];
  reason_chain: string[];
  next_questions: string[];        // shown in the UI as "Prompts for more info"
  signals: Signals;
  escalations: string[];
  impact_escalated_from: Impact | null;
  narrower_than_selected: boolean;

  // Iteration 2 — free text the user adds after seeing the prompts
  more_info: string | null;        // optional; editable in in_review, disabled from routed
  resolution_note: string | null;  // mandatory at Mark as resolved

  // classifier provenance
  classifier_mode: 'rules' | 'llm' | 'hybrid';
  llm_provider: string | null; llm_model: string | null;
  llm_agreed: boolean | null;
  rules_bucket: BucketId | null; llm_bucket: BucketId | null;
  llm_rationale: string | null;

  // human override
  bucket_final: BucketId; severity_final: SeverityLevel; routing_final: RoutingTeam;
  routing_other_text: string | null;
  override_reason: string | null; overridden_at: string | null; was_overridden: boolean;

  // lifecycle
  status: ReportStatus;
  submitted_at: string | null; routed_at: string | null; resolved_at: string | null;
};

type Signals = {
  functional_loss: 'broken' | 'degraded' | 'cosmetic';
  data_integrity: 'clean' | 'at_risk' | 'lost';
  data_loss_ongoing: boolean;
  exposure: 'none' | 'customer_harm' | 'legal';
  exposure_prompt_level: boolean;
  silent_failure: boolean;
  outage_language: boolean;
};
```

The `_final` fields are initialised equal to the computed fields at submit. Overrides
change only the `_final` fields, so the original recommendation is always recoverable.

### 4.2 ActivityEntry — append-only, never updated, never deleted

```ts
type ActivityEntry = {
  id: string; timestamp: string; report_id: string | null;
  actor: 'system' | 'user' | 'llm';
  action: string;
  field: string | null;
  value_from: string | null;   // Iteration 2: REAL content, not lengths
  value_to: string | null;     // Iteration 2: REAL content, not lengths
  detail: string;              // keyword-dense
  llm_rationale: string | null;
};
```

**Iteration 2 — store values, not lengths.** Every write action records the actual
before/after content in `value_from` / `value_to`, capped at
`ACTIVITY_VALUE_MAX_CHARS` (1000) with `…[truncated]` appended beyond that. No `*_len=`
token exists anywhere in the codebase. The `detail` string stays keyword-dense; the
field transition for an override (`bucket LLM->POST_CALL`) lives in `detail`, and the
full override reason goes in `value_to`.

### 4.3 FeedbackEntry

```ts
type FeedbackEntry = { id: string; timestamp: string; to: string; body: string };
```

---

## 5. The classification pipeline — `src/rules/pipeline.ts`

Fixed order, each step a pure function of the step before it.

```
raw input
  ├─ 1. normalize()         lowercase copy for matching, original kept for display
  ├─ 2a. rules pass         bucket scores + signals from keyword tables
  ├─ 2b. LLM pass           bucket + signals + evidence spans (skipped if no key)
  ├─ 3. arbitrate()         merge: model wins bucket on disagreement, signals by max severity
  ├─ 4. tiebreaks()         resolve ambiguity only when one method abstained
  ├─ 5. impactEscalation()  text may raise the dropdown, never lower it
  ├─ 6. severity()          base grid -> floors -> silent modifier
  ├─ 7. routing()           bucket -> team + escalation actions
  ├─ 8. confidence()        agreement + evidence strength
  ├─ 9. evidence()          verify every span is a real substring; drop the rest
  ├─ 10. questions()        bucket bank + conditionals, capped at 5
  └─ 11. secondaryTags()
```

**Bucket arbitration (Iteration 3):** when both classifiers produce a bucket and they
disagree, the model wins. Rules act as a backstop and as an independent second opinion for
confidence. Tiebreaks (keyword-based) are skipped when both methods have an opinion — they
suffer the same language blindness as rules. Confidence drops to Low on disagreement,
holding the report in review until a human confirms or overrides.

**Signal merge rule:** for each of the seven signals, take the more severe of the rules
reading and the LLM reading. Either method can escalate; neither can suppress the other.

**Under-triage costs more than over-triage in a system with a human confirm step.**

**Iteration 2 — contender set.** The tiebreak ladder runs over every bucket that had at
least one *pattern* hit, even if a negative keyword dragged its net score to zero. A
negative keyword lowers a bucket's rank; it does not veto the boundary rule from being
consulted. "Highest score wins" still ranks only positively-scored buckets.

---

## 6. The rules modules

Each file opens with a `WHAT THIS DOES / HOW TO CHANGE IT / WHY IT WORKS THIS WAY`
comment. Rules are flat keyword tables. See `src/rules/README.md`.

### 6.1 buckets.ts

A bucket answers "which layer of the stack got it wrong." Each has a plain-English
boundary rule, a `patterns` array (+2 per distinct hit) and a `negative` array
(-3 per distinct hit), floored at 0. `BUCKET_PRECEDENCE = [INFRA, POST_CALL, LLM, STT,
TTS]`. All three voice buckets route to "Voice AI" per the case study; splitting them is a
one-line change in `routing.ts`.

**Iteration 2** added plain-English phrasings to the pattern tables (e.g. "in circles",
"confused about", "gibberish", "summaries", "after calls", "502"/"503", "not landing")
so the boundaries survive reports that use none of the original vocabulary.

### 6.2 tiebreaks.ts

Ordered boundary tests: `whether_vs_what`, `direction`, `tool_misuse_is_reasoning`,
`latency_source`. A rule may only pick a bucket already in contention.

**Iteration 2** — `whether_vs_what` now respects negation ("nobody flagged an error",
"fired successfully", "200 OK" mean the transport did *not* fail);
`tool_misuse_is_reasoning` recognises "the dashboard shows it healthy" as the API being
fine and the agent's reading of it being wrong; `direction` recognises "couldn't make out
what the agent said" as an output-side problem.

### 6.3 signals.ts

Keyword tables for the seven signals. `silent_failure` is true when no
`silent_failure_absent` pattern matches AND at least one `silent_failure_present` does.
*Loud failures are bounded by how fast you notice them; silent ones are bounded by
nothing.*

### 6.4 severity.ts — the most important file

Severity answers one question: **what does it cost to wait?** Not blast radius, not
volume.

- **Step 1 — Outage short-circuit.** `impact === 'outage' || outage_language` returns
  Sev0 immediately.
- **Step 2 — Base grid** (`BASE_GRID[radius][functional_loss]`):
  `many: {broken:Sev1, degraded:Sev2, cosmetic:Sev3}`,
  `single: {broken:Sev2, degraded:Sev3, cosmetic:Sev3}`.
- **Step 3 — Floors**, in order, each can only raise:
  `data_loss_ongoing_at_scale`→Sev0, `compliance_systemic`→Sev0, `data_lost`→Sev1,
  `legal_exposure`→Sev1, `financial_records`→Sev1, `customer_harm`→Sev2.
- **Step 4 — Silent-failure modifier.** Raises one level, capped at Sev1.
  **Iteration 2:** the modifier only fires when something is actually being lost or is
  materially broken (`data_integrity !== 'clean' || functional_loss === 'broken'`). A
  quiet cosmetic blemish — a trailing space in an export, a truncated-but-present
  summary — is untidy, not silent damage.
- **Step 5** — return the level and the accumulated reasons array. The explanation is a
  byproduct of execution, never a second LLM call.

*Severity is not priority.*

### 6.5 impactEscalation.ts

The dropdown is a floor, not a ceiling. `outage_language` + `impact !== 'outage'` →
escalate to `outage`, set `impact_escalated_from`, show a visible note. Text that reads
*narrower* than the dropdown is flagged for review, never silently downgraded. Missing
impact defaults to `many`. (**Iteration 2:** the form now forbids submitting without an
impact, so the missing-impact default only applies to the pipeline being called directly,
e.g. by the seeds.)

### 6.6 routing.ts

`ROUTING[bucket] -> { team, check }`. `ESCALATIONS` fires on `severity === 'Sev0'`
(page on-call), `exposure === 'legal'` (notify Legal), `data_integrity === 'lost'`
(backfill scoping), `confidence === 'Low'` (hold in review, do not auto-route).

### 6.7 confidence.ts

- **High** — rules and LLM picked the same bucket and evidence spans verified.
- **Medium** — same bucket, weak/unverified evidence, or one method abstained.
- **Low** — different buckets (model wins the bucket but confidence falls), rules-only with
  top score under `CLASSIFIER.RULES_TOP_SCORE_LOW_THRESHOLD` (4), or the LLM call failed.
  Low blocks the Route button until a human confirms or overrides.

### 6.8 evidence.ts

Every span must be an exact substring of the submitted text (`indexOf` guard); overlapping
spans are collapsed so a keyword nested in another never renders as a stray fragment.

### 6.9 questions.ts

Per-bucket base bank + conditionals (missing call_id / started_at, data at risk, legal
exposure, low confidence), capped at `MAX_QUESTIONS_SHOWN`. The LLM may add at most one.

### 6.10 secondaryTags.ts

`data-loss`, `compliance`, `latency`, `regression`, `single-account`, `financial`. Do not
change routing.

### 6.11 duplicates.ts

Behind `FEATURES.DUPLICATE_DETECTION`, default off. Token-overlap similarity over
`CLASSIFIER.DUPLICATE_SIMILARITY_THRESHOLD` (0.6) shows a non-blocking banner.

---

## 7. The LLM layer

One call per submit. `prompt.ts` builds a system prompt containing the bucket boundary
rules and signal definitions imported verbatim from the rules files (never duplicated).
It demands strict JSON, no prose, no fences:

```json
{
  "bucket": "STT|TTS|LLM|POST_CALL|INFRA",
  "secondary_tags": ["..."],
  "signals": { "functional_loss": "...", "data_integrity": "...", "data_loss_ongoing": true,
               "exposure": "...", "exposure_prompt_level": false, "silent_failure": false,
               "outage_language": false },
  "evidence": [{ "supports": "bucket", "text": "exact substring from the report" }],
  "rationale": "one short keyword-dense line"
}
```

**The model never returns a severity level.** State that in the prompt.

`parse.ts` strips fences defensively, parses, validates every enum against the config
arrays, and drops any field that fails rather than throwing. A malformed response
degrades to rules-only for that report with confidence Low and a log entry, never an
error screen. Timeout / network / 401 / rate limit fall back to rules-only, set
`classifier_mode: 'rules'`, and write an activity entry naming the failure. A fetch that
never returns an HTTP response falls back the same way and logs `llm.cors_blocked`
(Iteration 2). The app must remain fully usable with a wrong or absent key.

---

## 8. Screens

### 8.1 Start screen (`/`)

Full-bleed dark. Provider select (Anthropic / OpenAI / Google / Moonshot / Rules only).

**Iteration 2:**
- When `none` is selected, an explainer appears directly beneath the select:
  *"Rules only runs the full triage engine locally using keyword rules. No API key, no
  network calls, nothing leaves this browser. You still get a bucket, severity, evidence,
  routing and prompts exactly as you would with a model. Confidence sits lower because
  there is no second method to cross-check against."*
- An always-visible **What's the difference?** link expands an inline block comparing
  Rules only (deterministic, instant, free, offline) with With a model (a second reader
  whose agreement raises confidence and whose disagreement flags for a human).
- The `none` option label is **`Rules only — no API key needed`**.
- The model field is **editable free text with a suggestions datalist**, not a dropdown,
  pre-filled with the provider's `defaultModel`. The key input is `type="password"` and
  both are hidden for Rules only.

Clicking "Click to start!" (blinking on `UI.START_BLINK_PERIOD_MS`, respecting
`prefers-reduced-motion`) writes the session flag and navigates to `/home`.

### 8.2 Home screen (`/home`)

Five navigation buttons around a Thor scene. With `FEATURES.THOR_HAMMER_ENABLED` false the
centre column collapses and the buttons stack; the layout must not look broken. Footer:
"Change model or key" and "Need help or Submit feedback to improve!" (opens `/feedback`
in a new tab).

### 8.3 Report form (`/report/new`, `/report/:id`)

One component, five states driven by `status`.

**Draft / new.** All input fields editable, each carrying its `FIELD_IDS` id.

- **Iteration 2 — impact is a segmented button group**: three buttons
  (`input-impact-single` / `input-impact-many` / `input-impact-outage`) inside a
  container carrying `FIELD_IDS.IMPACT` with `role="radiogroup"`, arrow-key navigation,
  and **no default selection**. Submitting without one is a validation error:
  *"Choose an impact level."*
- **Iteration 2 — "Started at" is `type="date"`**: no time component in the input, the
  stored value (`YYYY-MM-DD`), or the display.
- Buttons: `btn-discard` (confirm; a never-saved form navigates away with nothing
  persisted, an existing draft is set to `discarded`), `btn-save` (persist as `draft`,
  toast "Draft saved."), `btn-submit` (validate, run the pipeline, set `in_review`).
- **Iteration 2 — on submit success, route immediately to `/report/:id`** in its
  `in_review` state and show the toast on the destination page.

**In review.** Input fields disabled but fully readable (dimmed, dashed border, never
`opacity: 0.4`). Then:

- **Iteration 2 — the section is titled "Triage results"** (was "Recommendations"), laid
  out in **two columns above 768px, one below** (left first). Left column: bucket,
  secondary tags, severity + reason chain, confidence, routing suggestion + what to
  check. Right column: evidence (report text with matched spans highlighted),
  escalations.
- **Iteration 2 — secondary tags get their own labelled row** directly under Bucket.
  Empty state: `—` with a muted tooltip *"No secondary tags matched."*
- **Iteration 2 — "Prompts for more info"** (label change only; field name
  `next_questions` unchanged), with a **Copy prompts** action.
- **Iteration 2 — a "More info" textarea** (`input-more-info`, four rows) sits directly
  beneath the prompts. Helper: *"Answer any of the prompts above, or add anything else
  that comes to mind. This goes to the team you route to."* Placeholder (grey italic):
  `Add anything the prompts above surfaced...`. Optional — does not block routing.
  Editable in `in_review`, disabled from `routed` on. Persisted to `more_info` on change
  (debounced `UI.MORE_INFO_DEBOUNCE_MS`) and on route, with an activity entry carrying
  the actual text in `value_to`.
- The override block, prepopulated with the computed values: `override-bucket`,
  `override-severity`, `override-routing`, `override-routing-other` (appears and is
  required only for "Other"), `override-reason` (hidden until one of the three above
  changes, then mandatory with `VALIDATION.REASON_MIN_CHARS`).
- `btn-route` active, `btn-resolve` disabled with tooltip "Route to a team first."
  Clicking Route validates the reason if needed, writes `routing_final`,
  `was_overridden`, `routed_at`, logs each changed field as its own activity entry, and
  moves to `routed`. Low confidence blocks Route until a human overrides or ticks a
  confirm box.

**Routed.** Every field disabled including overrides. `btn-resolve` active. If an
override happened, a block shows what the system recommended, what the human decided, and
the stated reason, side by side.

- **Iteration 2 — `btn-resolve` opens a modal** ("Document the resolution") with one
  required textarea (`input-resolution-note`, six rows, min `RESOLUTION_MIN_CHARS`),
  helper *"What was the actual cause, and what fixed it? This is what the next person
  reads when a similar report comes in."*, and two buttons: **Mark as resolved**
  (primary, disabled until valid) and **Cancel**. On confirm it writes `resolution_note`,
  sets `resolved_at`, moves to `resolved`, and logs it with the full note in `value_to`.

**Resolved.** Everything disabled. **Iteration 2 — the resolution note shows in its own
block near the top of the report**, above the triage results.

**Discarded.** Read-only with a "Discarded" pill.

### 8.4 Triage queue (`/queue`)

Table columns: ID, Created, Customer, Report (truncated 60 chars), Bucket, Severity,
Confidence, Routing, Status, Overridden.

**Iteration 2 — filters are rows of multi-select toggle buttons** with a visible active
state and a **Clear all** control that appears only when at least one filter is active:

| Row | Options |
|---|---|
| Bucket | Speech-to-text, Text-to-speech, LLM, Post-call, Infrastructure |
| Severity | Sev0, Sev1, Sev2, Sev3 |
| Status | Draft, In review, Routed, Resolved |
| Routing team | Voice AI, Platform/Infra, Integrations, Other |
| Customer | free-text input (unchanged) |

Within a row selections are OR; across rows AND; an empty row does not filter.

**Iteration 2 — Discarded is removed entirely** from the status filter, and discarded
reports are not listed in the queue at all (they remain in the Data files tables).

**Iteration 2 — the Confidence column gets a coloured badge** (`--conf-*` tokens,
deliberately not the severity scale; the label text is always present).

Sort by any column, default newest first. Row click opens the report in the same tab with
a "Back to queue" button that preserves filter state (via the URL query string).

Empty state: "No reports yet. Start with a new bug report." with a link.

### 8.5 Activity log (`/activity`)

Hidden entirely when `FEATURES.ACTIVITY_LOG_ENABLED` is false. Reverse-chronological
table: Timestamp, Report, Actor, Action, Field, From, To, Detail, LLM rationale. Filter
by report ID and by actor.

Log an entry for every write action: report created, draft saved, submitted, each
classification output computed, each override, `more_info` updated, routed, resolved,
discarded, LLM called, LLM failed, LLM CORS-blocked, feedback submitted, seed loaded.

`detail` is keyword-dense. **Iteration 2 — `value_from` / `value_to` carry the real
content** (capped at 1000 chars, `…[truncated]` beyond), never lengths, never `*_len=`.

`llm_rationale` is the single line the model returned, verbatim, capped at 140
characters.

### 8.6 User guide (`/guide`)

One scrollable page: what this tool does, the five buckets with boundary rules, the
severity rubric as a table, the four cases where blast radius alone gets it wrong, how to
submit, the Triage results / More info / override flow, what the confidence levels mean,
where the data lives and how to export it. Screenshot placeholders load from
`public/guide/` with descriptive alt text.

### 8.7 Feedback (`/feedback`, opens in a new tab)

`To` prepopulated with `FEEDBACK_EMAIL` as a `mailto:` link. A textarea with a grey
italic placeholder from `FEEDBACK_PLACEHOLDER`. Submit appends to the feedback store,
logs it (with the body text in `value_to`), shows "Feedback saved." Also "Open in email
client" builds a `mailto:` with the body prefilled.

### 8.8 Data files (`/data`)

Bulleted links, each opening a generic HTML table in a new tab: Reports (every column,
input then computed then override then lifecycle — **including `more_info`,
`next_questions` and `resolution_note`**), Activity log, Feedback. Each table view gets
Copy as TSV and Download CSV. Under `FEATURES.EVAL_HARNESS_ENABLED`, a **Run all seeds**
button re-runs the rules-only pipeline over the 15 examples and renders a pass/fail
comparison against `expected.ts`.

---

## 9. Thor Hammer (`components/ThorHammer.tsx`)

Self-contained behind `FEATURES.THOR_HAMMER_ENABLED`. Inline SVG: sky gradient, grass
band, hammer embedded head-down in the grass. On mount pick a target uniformly at random
in `[THOR.MIN_ATTEMPTS, THOR.MAX_ATTEMPTS]`. Hover shows the tooltip. Each click
increments a counter; below target opens a modal with `THOR.FAILURE_MESSAGE` and a single
button that must be dismissed first. At the target the hammer lifts over
`THOR.LIFT_DURATION_MS` and a Drop button appears; Drop returns it, resets the counter,
picks a new target. State is component-local; nothing is persisted or logged.

---

## 10. Seed data — `src/store/seed.ts`

On first run, if `FEATURES.SEED_DATA_ENABLED` and the reports store is empty, load the 15
examples. Each is run through the real pipeline in rules-only mode, then stamped
`status: 'resolved'` with backdated timestamps spread over the prior ten days. Outputs are
never hardcoded — editing a rule and reseeding visibly changes the seeds.

**Iteration 2 — each seed carries a short plausible `resolution_note`** (e.g. *"Root-caused
to ASR confidence threshold too low for short utterances. Raised the yes/no confirmation
threshold and added an explicit re-prompt. Fixed in release 4.12."*) and `more_info: null`.

The 15 inputs and the `expected.ts` answer key (bucket + severity for all 15) are as in
the original spec. `expected.ts` also holds 6 adversarial cases; if the engine disagrees
with `expected.ts`, fix the rules, not the test.

**Iteration 2 — hold-out set.** `src/rules/__tests__/holdout.ts` is a 30-case set phrased
differently from the seeds (different vocabulary, several with no keyword hits).
`holdout.test.ts` runs the rules-only pipeline over it and asserts the documented floors:
**bucket ≥ 22/30, severity ≥ 21/30**. Bucket and severity are separate numbers.

---

## 11. Design direction

An arcade cabinet that boots into a control room. The start screen is the only playful
surface; everything past it is a disciplined ops tool. Left-aligned throughout except the
start screen. Hairline `--rule` dividers, not card borders. IBM Plex Sans everywhere,
IBM Plex Mono for Call IDs / evidence / activity detail, Silkscreen for "Click to start!"
only. Motion only where allowed (start blink, hammer lift, state-change confirmations),
all respecting `prefers-reduced-motion`. Buttons say what happens. Colour is never the
sole carrier of meaning. Responsive to 768px, visible keyboard focus, semantic tables.

---

## 12. Build order

Verify each milestone by running the app before starting the next.

1. Scaffold, `config.ts`, `types.ts`, routing, design tokens, layout shell
2. Storage layer with schema versioning, plus the reports store and CRUD
3. Rules engine end to end in rules-only mode, Vitest suite passing on all 15
4. Report form: draft, save, submit, in-review rendering of all computed output
5. Override block, route, resolve, and the full status machine
6. Triage queue with filters and back-navigation
7. Activity log wired to every write action
8. LLM layer, arbitration, confidence, graceful degradation with a bad key
9. Data files, table views, CSV export, eval harness
10. Start screen and home screen
11. Thor Hammer
12. User guide, feedback, README, DECISIONS.md

**Iteration 2 build order:** schema migration first, then start screen (explainers +
providers + free-text model), then the report form (segmented impact, date field,
navigate-on-submit), then the Triage results section (two columns, secondary-tags row,
More info), then the queue (toggle filters, no Discarded, confidence badge), then the
resolution-note modal, then the activity-log value logging. Run the test suite after each
group.

**Iteration 4 (bulk upload):** CSV parser (`src/lib/csvParser.ts`) first — RFC-4180,
BOM stripping, no library. Then the BulkUpload screen (`/bulk`): template download,
column-spec table, drag-and-drop upload zone, preview table (Valid/Error/Warning), import
via `runTriage` + `submitReport` (same functions as the form), sequential LLM calls with
delay and progress indicator, batch activity log entry, error-rows CSV download. Schema
bump to v4 with `import_source` field. Home screen adds a sixth button (Bulk upload) in
column 1 below New bug report.

---

## 14. Verbose mode / decision trace (Iteration 5)

A flag that exposes how each triage decision was reached, for tuning the rules.

**Flag.** `FEATURES.VERBOSE_MODE` in `config.ts`, default `false`, is the build-time
default. A runtime toggle in the home-screen footer (next to "Change model or key")
flips `Settings.verbose` in the settings store; `readSettings()` falls back to
`FEATURES.VERBOSE_MODE` until it is set. When verbose is off, nothing is captured — the
guard is at the call site in `pipeline.ts` / `lib/triage.ts`, not inside the rule
functions — so there is no cost and classification output is byte-identical.

**Schema.** `SCHEMA_VERSION` → 5. `TriageReport` gains `has_trace: boolean` (default
`false`). Full traces live under `STORAGE_KEYS.TRACES` as `StoredTrace[]`, keyed by
report id, capped at `TRACE.STORE_CAP` (50), oldest evicted first. v4 → v5 migration
backfills `has_trace: false`.

**What is captured.** `src/rules/trace.ts` builds a `Trace` of exactly
`TRACE.STEP_IDS.length` (11) steps, in pipeline order: `normalize`, `rules_bucket`,
`llm_call`, `arbitration`, `tiebreaks`, `signals_merge`, `impact_escalation`,
`severity`, `confidence`, `evidence`, `questions`. Each `TraceStep` has a one-line
`summary` and a structured `detail`. The explain\* functions re-derive the "why" from the
same rule tables the pipeline uses (`BUCKETS`, `FLOORS`, `TIEBREAKS`, `CONDITIONAL_QUESTIONS`,
…) — never re-running a decision — and drift tests in `trace.test.ts` prove the
explanation still agrees with the real function. The `llm_call` step's network detail
(latency, HTTP status, raw response body truncated to `TRACE.RAW_BODY_MAX_CHARS` = 4000,
which parsed fields survived validation vs were dropped and why) comes from
`LlmOutcome.debug`, attached by `client.ts` only when `{ capture: true }`. **The API key
never appears in a trace** — only the response body and status, never request headers.

**Where it shows.** A "Decision trace" section at the bottom of the report page, visible
only when `report.has_trace`, collapsed by default (`components/DecisionTrace.tsx`). Each
step is its own expandable row: one-line summary → detail. The **severity** step renders
every floor as a table — id, plain-English `condition` (a new field on each `FLOORS`
entry, kept in sync with `when`), the signal values it evaluated against, fired yes/no,
resulting level — floors that did NOT fire included.

**Compare two runs.** A "Re-run triage" button (verbose only) re-runs the current rules
against the same input (the original impact dropdown is recovered from
`impact_escalated_from`) and shows a `TraceDiff` against the stored trace: which step
summaries changed, plus a bucket/severity/confidence/routing before-after table. Nothing
is overwritten until **Apply**, which calls `reclassifyReport(id, result)` — it swaps
the computed fields and trace and keeps status, timestamps and any human overrides,
logging `report.rerun_applied`.

**Export.** "Copy trace as JSON" on the report; `has_trace` is a column in the Reports
table under Data files.

**Batch trace.** With verbose on, "Run all seeds" also captures traces across the 15
seeds + 30 hold-out cases (45 runs) and rolls them into a summary: per-floor and
per-tiebreak fire counts / 45 (with a "never fired" flag), most-frequent bucket-pattern
hits, and the rules/model disagreement count (0 by construction in rules-only mode).

**Constraints.** Verbose off → byte-identical `bucket` / `severity` / `confidence` /
`evidence` (proven by `trace.test.ts` over all 45 inputs). No capture in the hot path
when off. Nothing is redacted except the API key, which is never in a trace.

---

## 13. Acceptance checklist

Original:

- [ ] `npm install && npm run dev` works from a clean clone with no key
- [ ] Every one of the 15 seeds matches `expected.ts`
- [ ] A wrong API key degrades to rules-only with a log entry, never an error screen
- [ ] Setting any single flag in `FEATURES` to false leaves the app working and the
      layout intact
- [ ] Overriding a field without a reason is blocked
- [ ] The original recommendation is still readable after an override
- [ ] Every evidence span appears verbatim in the submitted text
- [ ] Every severity output carries a reason chain that matches the level shown
- [ ] The activity log has an entry for every write action
- [ ] Routing is impossible without an explicit Confirm action
- [ ] Thor requires 2 or 3 clicks, varying between cycles, and Drop resets the target
- [ ] No classification logic exists outside `src/rules/`
- [ ] No hardcoded string or number exists outside `src/config.ts` and `src/rules/`

Iteration 2:

- [ ] A v1 localStorage payload loads without error and gains the new fields
- [ ] All four providers appear on the start screen; selecting each swaps model
      suggestions and key placeholder
- [ ] The model field accepts a typed model ID that is not in the suggestions
- [ ] Rules only shows the explainer text; What's the difference? expands
- [ ] Impact is three buttons, keyboard navigable, no default, and blocks submit when
      unset
- [ ] Start date has no time component anywhere
- [ ] Submitting a new report lands on that report's page in the in-review state
- [ ] Triage results renders in two columns above 768px and one below
- [ ] Secondary tags have their own labelled row and show `—` when empty
- [ ] More info persists, appears in the Reports table, and is disabled once routed
- [ ] Queue filters are toggle buttons with visible active state and a Clear all
- [ ] Discarded appears nowhere in the queue or its filters
- [ ] Confidence badges are coloured and visually distinct from severity badges
- [ ] Mark as resolved is blocked until a resolution note is entered
- [ ] The resolution note displays on resolved reports and appears in the Reports table
- [ ] No `_len=` token exists anywhere in the codebase
- [ ] An override log entry contains the full override reason text
- [ ] The hold-out set clears bucket ≥ 22/30 and severity ≥ 21/30 rules-only

Iteration 5 (verbose mode):

- [ ] A v4 localStorage payload loads without error and gains `has_trace: false`
- [ ] With verbose off, same input produces identical bucket / severity / confidence /
      evidence to today, and no trace is captured or stored
- [ ] The home-footer toggle flips verbose and persists it in the settings store
- [ ] A verbose triage run shows a collapsed "Decision trace" section with one row per
      pipeline step (11)
- [ ] The severity step shows every floor as a table, including the ones that did not fire
- [ ] "Copy trace as JSON" copies a valid JSON trace; the Reports table has a `has_trace`
      column
- [ ] "Re-run triage" (verbose only) diffs against the stored trace and does not
      overwrite until Apply; Apply keeps status and human overrides
- [ ] "Run all seeds" with verbose on shows a batch trace summary over 45 runs, flagging
      any floor / tiebreak that never fired
- [ ] Trace store is capped at 50, oldest evicted first
- [ ] The API key never appears anywhere in a trace
