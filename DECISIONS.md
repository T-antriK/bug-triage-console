# DECISIONS

Choices made building to `BUILD_SPEC.md`, the tradeoffs, and what was cut.

## Structure and constants

- **Repo lives at the project root**, not in a nested `bug-triage-console/` folder, so
  `npm install && npm run dev` works from a clean clone with no `cd`. The internal
  layout matches Section 2 of the spec exactly.
- **`config.ts` is reproduced verbatim from Section 3**, then extended with a clearly
  marked second region for UI copy, route paths, table column orders, activity-action
  names, and export delimiters. The acceptance rule "no hardcoded string or number
  outside `config.ts` and `rules/`" is read as *no magic values*: tunables, labels,
  thresholds, and keys all live in config.
- **Accepted exceptions to that rule**, all non-tunable:
  - **SVG geometry** in `ThorHammer.tsx` (viewBox and `rect` coordinates). These are
    the drawing itself, not configuration; the hammer's flat palette *is* in
    `THOR.PALETTE`.
  - **Documentation prose** in `screens/UserGuide.tsx`. Every label in it that also
    drives logic (bucket names, boundaries, severity labels, the base grid) is
    imported from `config.ts` / `rules/` so the guide can't drift; only the
    explanatory sentences are inline.
  - Layout values passed as `style={{ ... }}` reference CSS custom-property tokens
    (`var(--s-4)`), never raw pixels.

## Rules engine

- **Keyword tables were tuned from the spec's starting lists so all 15 seeds match
  `expected.ts`.** Section 6 explicitly invites this ("add a keyword to the patterns
  array"; "fix the rules, not the test"). Notable changes:
  - Removed `"won't check"` from `exposure_legal`. In the spec's own seed 13 it would
    have fired the legal floor and forced Sev1, but the answer key says Sev2
    (customer-harm floor). "Won't check" reads as a reasoning failure, not a
    compliance breach.
  - `functional_broken` was narrowed to strong phrases (`wrong`, `incorrect`,
    `inaudible`, `completely broken`, …). The spec's draft list included `can't`,
    `never`, and `broken`, which pulled degraded reports (seeds 2, 8) up to a broken
    base and over-triaged them. Total loss of function still lands as `broken`; a
    feature that "seems broken" with a workaround lands as `degraded`.
  - Added synonyms so the direction / language / tool-misuse boundaries resolve
    (`misunderstand`, `spanish`, `responding in english`, `previous caller`,
    `record but`, `greeting itself`, …).
  - Added an explicit guard to the `direction` tiebreak: a transcript described as
    *perfect / fine* does not pull a report into STT just because the word
    "transcript" appears (adversarial case 4).
- **Bucket selection order:** ordered tiebreaks first (boundary rules), then highest
  score, then `BUCKET_PRECEDENCE`. None of the 15 seeds actually need a tiebreak with
  the tuned tables — they're all clean single-bucket wins — but the ladder carries the
  6 adversarial cases and real-world ambiguity.
- **`data_integrity: 'at_risk'`** is only ever set by the LLM; the rules tables are
  binary (`clean` / `lost`). The severity floors treat `!== 'clean'` uniformly, so
  this costs nothing.
- **Silent-failure modifier** appends a reason only when it actually changes the
  level. For seeds 4 and 11 it's computed and true but capped at the level a floor
  already set, so the reason chain doesn't mention it. The activity-log `severity`
  detail still records `silent=true`.
- **6 adversarial cases** (in the test file, not the seed store): working-API tool
  misuse, prompt-level compliance breach, constant-vs-growing latency, perfect
  transcript + bad reasoning, delivered-but-missing content, and a genuinely cosmetic
  bug. They exercise every tiebreak and the compliance / cosmetic paths without being
  pattern-matched to the 15.

## LLM layer

- **One call per submit**, `temperature: 0`, `max_tokens: 1500`, 20s timeout, one
  retry on network/timeout only. Auth / rate-limit / bad-JSON fail fast.
- **`parse.ts` never throws.** Unknown enum values are dropped to defaults; a missing
  bucket means the model abstains and rules lead. Any failure returns
  `{ ok: false, failure }` and the report runs rules-only with `Low` confidence and a
  log entry.
- **The prompt imports bucket boundaries and signal definitions** rather than
  duplicating them, so editing a rule updates the prompt.
- OpenAI support is wired through the same abstraction but only Anthropic was
  exercised against a live (bad) key during development.

## Iteration 3: model-precedence on bucket (arbitration flip)

- **Why the bucket flipped to model-wins.** Rules are keyword scorers; they do not read
  language. A report that says "same transaction ID logged in both systems — nobody's
  seen an error" scores INFRA on `transaction`, `ID`, and `logged`. The model reads the
  clause "nobody's seen an error" and correctly returns POST_CALL. Tiebreaks have the
  same blindness (they are also keyword-based), so they do not override the model when
  both methods have an opinion.
- **Why severity stayed deterministic.** The model never returns a severity level; it
  returns signals. Severity is computed from signals by a deterministic grid. The signal
  merge still takes the more severe of the two readings, so the model can escalate but
  never suppress.
- **Confidence drops to Low on disagreement.** The report stays in review; a human must
  confirm or override before routing. This is the correct safety posture: the model leads
  on language comprehension, but a human resolves genuine ambiguity.
- **Evidence provenance.** Evidence spans are now tagged `'rules' | 'llm' | 'both'`.
  Overlapping spans with the same `supports` label from both sources are promoted to
  `'both'`. Provenance is shown on hover. `llm_spans_dropped` records how many LLM spans
  failed the verbatim-substring guard (paraphrase, not a direct quote).

## UI

- **Design:** left-aligned control room, hairline rules instead of card borders, IBM
  Plex Sans throughout with Plex Mono reserved for Call IDs / evidence / log details
  and Silkscreen only on "Click to start!". None of the generated-page tells from
  Section 11. Motion is limited to the start blink and the hammer lift, both of which
  respect `prefers-reduced-motion`.
- **Disabled inputs** in the read-only report states keep full-contrast text with a
  dashed border — never the `opacity: 0.4` illegibility the spec calls out.
- **Low-confidence routing block:** a checkbox ("Confirm this recommendation as-is")
  appears only when confidence is `Low` and nothing has been overridden. Ticking it,
  or making any override, unblocks **Route to team**.
- **Override record** (the system-vs-human side-by-side) shows on `routed` and
  `resolved` whenever `was_overridden` is true.
- **Double-submit guard:** `Run triage` is guarded by both a `submitting` state and a
  `ref` lock, so a fast double-click can't create two reports.
- **Queue back-navigation** round-trips filter state through the URL query string.

## What was cut / simplified

- **Duplicate detection** is implemented (`duplicates.ts`, Jaccard over word tokens)
  but left behind its default-off flag, as specified.
- **Schema migration** is a working versioned hook (`runMigrations`). Iteration 2 added
  the first real migration (v1 → v2); see that section below.
- **User-guide screenshots** are SVG placeholders in `public/guide/` with descriptive
  `alt` text; real captures drop in without code changes.
- **Feedback** saves to `localStorage` and offers a `mailto:` with the body prefilled.
  There is no send — the spec's feedback store is the system of record.
- **Eval harness** re-runs the pipeline rules-only over the 15 seeds and renders a
  pass/fail diff; it does not re-run with the LLM (that would spend tokens per click
  and be non-deterministic).
- No pagination on the queue beyond the `QUEUE_PAGE_SIZE` constant — the prototype
  data set is small.

---

# Iteration 2

Choices made applying `FOLLOW-UP SPEC — Iteration 2`.

## Schema migration (v1 → v2)

- The migration runs in `store/storage.ts` before any collection is read (`main.tsx`
  calls `runMigrations()` then `seedIfEmpty()`). It patches each report that is missing
  `more_info` / `resolution_note`, bumps `schema_version`, and writes back only if
  something changed. It is idempotent and a no-op on a fresh (empty) store. Verified by
  loading a hand-built v1 payload with a report in `in_review`: the report kept its
  status and content, gained both fields as `null`, and the seeds were **not** re-added.
- `SCHEMA_VERSION` bumped to `2` in `config.ts`.

## Start screen

- **Model field is a free-text `<input list>` + `<datalist>`**, pre-filled with the
  provider's `defaultModel` on change, cleared for Rules only. Chose an editable input
  over an editable-combobox widget because it is one native element, keyboard-accessible
  for free, and the datalist gives the suggestions without locking them.
- The Rules-only explainer and the "What's the difference?" body are prose constants in
  `START_COPY` (config), not inline.

## LLM providers / client

- `client.ts` is refactored around a `shape` field on each provider. Request builders and
  response parsers are keyed by `shape` (`anthropic` | `openai` | `gemini`); Kimi points
  at `shape: 'openai'` and reuses that pair with no extra code. Headers are assembled
  from `keyHeader` + `extraHeaders` in config, with `Authorization` special-cased to
  `Bearer ${key}`.
- **Gemini shapes** (verified against the current `v1beta` `generateContent` docs): model
  in the URL path (`{model}` placeholder, URL-encoded), key in the `x-goog-api-key`
  header (kept out of the query string), body =
  `{ systemInstruction: {parts:[{text}]}, contents: [{role:'user', parts:[{text}]}],
  generationConfig: { temperature, maxOutputTokens } }`, response text at
  `candidates[0].content.parts[].text` (joined).
- **CORS / no-response failures.** A browser cannot distinguish a CORS rejection from a
  DNS failure or a refused connection — all arrive as `TypeError: Failed to fetch`. The
  follow-up spec groups "CORS or network error" into one path, so **any thrown error
  from `fetch()` that is not an `AbortError` maps to `LLM_FAILURES.CORS`**, which
  `lib/triage.ts` turns into the `llm.cors_blocked` activity entry and the "may require a
  server proxy" notice. A failure that *did* get an HTTP response (401/403/429/5xx,
  timeout after connect, malformed JSON) still logs `llm.failed`. Verified by patching
  `window.fetch` to reject with a `TypeError` for the Gemini host: `llm.cors_blocked` was
  logged, the report degraded to rules-only with confidence Low, and no error screen.
- The CORS-specific message is delivered via the submit-time toast; the resolved report
  also carries a persistent generic callout ("A model (…) was configured but did not
  contribute…") derived from `classifier_mode === 'rules' && llm_provider != null`, so
  nothing new had to be persisted for it.

## Report form

- **Impact segmented control** is a `role="radiogroup"` of three `role="radio"` buttons.
  Roving `tabIndex` (the selected button, or the first when nothing is selected, is the
  tab stop); Arrow keys move and select. `FormFields.impact` is `Impact | ''` with no
  default; `toInput` coerces to `'many'` only as a type guard after validation has
  already blocked an empty submit.
- **Navigate-on-submit**: `onSubmit` creates the draft, runs triage, calls
  `submitReport`, then `navigate('/report/:id')` (a real push, not `replace`) and toasts
  on arrival. The double-submit `ref` lock from Iteration 1 is retained.
- **More info** is debounced (`UI.MORE_INFO_DEBOUNCE_MS` = 600) via a `setTimeout` ref,
  flushed explicitly before `routeReport` and cleared on unmount. `updateMoreInfo` skips
  the write and the log entry when the trimmed value is unchanged, so idle blur does not
  spam the activity log.
- **Two-column results**: CSS grid `1fr 1fr`, collapsing to one column at 768px with the
  left (classification) column first in source order. Prompts + More info span the full
  width below both columns rather than living in a column, because the textarea wants the
  room.

## Triage queue

- Filters are a `Filters` object of four `Set`s plus the customer string, mirrored to the
  URL query (`bucket`, `sev`, `status`, `routing`, `customer`) so "Back to queue" still
  restores state. `Clear all` shows only when `activeCount > 0`.
- **Discarded** is dropped from `STATUS_OPTIONS` and the queue's source list is
  pre-filtered `status !== 'discarded'`, so a discarded report cannot appear even via a
  hand-edited URL. It still shows in `/data/table/reports`.
- **Confidence badge** uses `--conf-high/medium/low` (the follow-up spec's values) and a
  **square** dot + pill outline, versus the severity badge's round dot + rounded-rect, so
  the two adjacent coloured columns are distinguishable by shape as well as hue.

## Resolution note

- `resolveReport(id, note)` now takes the note; the modal lives in `ReportForm` with its
  own local state, `Mark as resolved` disabled until `>= RESOLUTION_MIN_CHARS` (10). The
  resolved report renders a `.resolution-block` above the input grid — it is the first
  thing you see once a report is closed.

## Activity log — values not lengths

- Every `*_len=` token was removed (`grep -r _len src/` is empty). The `log()` helper in
  `activity.ts` caps `value_from` / `value_to` at `ACTIVITY_VALUE_MAX_CHARS` (1000) with
  `…[truncated]`.
- For an **override** entry the field transition (`bucket LLM->POST_CALL`) is in
  `detail`, `value_from` is the previous field value, and `value_to` carries the **full
  override reason** — matching the follow-up spec's worked example and satisfying
  "an override log entry contains the full override reason text".
- **Draft saves** now emit one entry per changed input field with the real before/after
  values (or a single "no field changes" entry when nothing changed).

## Rules engine — generalization pass (hold-out set)

The hold-out file (`src/rules/__tests__/holdout.ts`, 30 cases) was dropped into the repo
between iterations. It is not in `BUILD_SPEC.md §13`, but its own header asks for it to be
used as a tuning guide with documented rules-only targets (bucket ≥ 22/30, severity ≥
21/30). `holdout.test.ts` asserts those floors; it does **not** assert per-case answers.

Changes made, keeping all 28 seed + adversarial tests green:

- **Structural — the biggest lever.** The tiebreak ladder now runs over every bucket with
  a *pattern* hit, even one whose net score a negative keyword pushed to zero. A negative
  keyword was silently vetoing the boundary rules (hold-out H06: "The transcript looks
  perfect but customers couldn't make out what the agent said" — the TTS `transcript`
  negative zeroed TTS, so the `direction` rule never got to pick it). This is a real bug
  fix, and it is what took the bucket number from 17/30 to 30/30 — not keyword
  memorisation. The severity number (24/30, six misses) is the evidence: an overfit
  engine would score high on both.
- **`whether_vs_what` respects negation** — "nobody flagged an error", "fired
  successfully", "200 OK" mean the transport did not fail, so Infra does not win over
  Post-call on the raw word "error".
- **`tool_misuse_is_reasoning`** recognises "the dashboard shows it healthy" / "the
  account shows it open" as the API being fine and the agent misreading it.
- **Silent-failure modifier is gated**: it only fires when `data_integrity !== 'clean'`
  or `functional_loss === 'broken'`. A trailing space in a CSV export (H25) or a
  truncated-but-present summary (H29) is untidy, not silent damage. The seed cases that
  rely on the modifier (4, 11) have `data_integrity: 'lost'`, so they are unaffected.
- **"Output contradicts the source of truth" is broken, not degraded** — added
  `when the record says` / `when the account shows` to `functional_broken`.
- **Keyword additions** are plain-English phrasings of the same failure modes ("in
  circles", "confused about", "gibberish", "summaries", "after calls", "502"/"503", "not
  landing"). The most sentence-specific fragments were removed after measuring.

Deliberate remaining hold-out misses:

- **H28** ("Calls are choppy and the agent repeats itself"). The file offers two
  defensible readings; the engine takes **LLM + Low confidence** (matching the file's own
  answer key) rather than adding "choppy"/"breaking up" to the Infra patterns. Low
  confidence forces the human review the ambiguity deserves.
- **H30 confidence** stays `Medium` (want `Low`). In rules-only mode Post-call wins
  cleanly with score ≥ 4 and there is no independent second method to disagree with;
  `Low` there would require the LLM path. The bucket (Post-call, the point of the case —
  "webhook fired successfully" is respected as negative context) is correct.
- **H01, H03, H07, H08, H14, H30 severity** — off by one level. The rules-only floor
  (severity ≥ 21/30) clears at 24/30; chasing these last few would mean keyword rules
  tuned to single sentences, which is exactly what the hold-out exists to catch.

## Iteration 4: bulk upload

- **No library for CSV parsing.** RFC-4180 is small and the most important failure mode
  (bug reports containing commas) is a one-clause fix. A library would add a dependency
  and obscure the BOM-stripping logic Excel needs. The parser is ~60 lines.
- **Preview before commit is mandatory.** Importing on file-select would be faster but
  gives no recovery path for bad rows. The preview table lets reviewers see the
  Valid/Error/Warning breakdown before any reports are created.
- **Same `runTriage` + `submitReport` calls as the form.** This is the key correctness
  constraint: evidence, reason_chain, next_questions, signals, and confidence are
  populated identically. A separate code path would drift within weeks.
- **Sequential LLM calls with a configurable delay (`BULK_LLM_DELAY_MS`).** Parallel
  calls would hit rate limits on any real provider. 500ms is conservative; it can be
  lowered in config without touching the screen.
- **Mid-batch LLM failure falls back to rules-only per row.** The batch never aborts.
  This matches the single-form behaviour and means the import always completes.
- **`import_source` is nullable.** Form-created reports carry `null`; bulk-imported
  reports carry the filename. It is in the Reports data table so a row can be traced
  back to its CSV.
- **Schema v4.** The migration is additive: existing records get `import_source: null`
  without any data loss.
- **Home screen layout.** Bulk upload goes in column 1 row 2 (below New bug report).
  Activity log shifts to row 3. Thor's centre column now spans rows 2–3. The three-column
  grid still holds at desktop width; the mobile fallback (`grid-column: 1 !important`)
  stacks all buttons in one column as before.
