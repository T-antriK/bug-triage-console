# Bug Triage Console

A local-first internal tool that turns a messy natural-language bug report about a
production voice agent into a **recommended** bucket, severity, routing team,
confidence, evidence, and prompts for more info. A human confirms before anything is
routed, and the original recommendation is always kept so you can see what changed.

Built to `BUILD_SPEC.md` (Bug Triage Console).

---

## Setup

```bash
npm install && npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`). No key is required —
the app runs in rules-only mode out of the box and loads 15 worked examples on first
run.

Other scripts:

```bash
npm test          # the rules suite (Vitest): 15 seeds + 6 adversarial cases + invariants
npm run build     # type-check + production build
npm run preview   # serve the production build
```

Requirements: Node 18+ (developed on Node 24). Zero runtime dependencies beyond React,
React Router, and plain `fetch` for the provider calls.

---

## How to plug in a key

1. On the **start screen**, choose a provider: **Anthropic (Claude)**, **OpenAI**,
   **Google (Gemini)**, **Moonshot (Kimi)**, or **Rules only — no API key needed**.
   A short explainer appears for Rules only, and a **What's the difference?** toggle
   compares the two modes.
2. For any model provider, the **model** field is editable free text with a
   suggestions datalist — type whatever model ID the provider currently supports —
   and the key goes in a `type="password"` field. Both are stored only in
   `localStorage` under `triage.settings.v1`.
3. Click **Click to start!**. To change the key later, use **Change model or key** in
   the home-screen footer.

When a key is set, each triage run makes **one** call to the provider. `client.ts`
picks a request builder and response parser from the provider's `shape`
(`anthropic` | `openai` | `gemini`); Kimi is OpenAI-compatible and reuses that pair.
The model returns a bucket, the seven severity signals, evidence spans, and a
one-line rationale — it **never** returns a severity level. The deterministic rules
engine merges the two readings (taking the more severe of each signal) and computes
severity itself.

If the call times out, 401s, rate-limits, errors, or returns malformed JSON, that
report silently degrades to rules-only: `classifier_mode` is set to `rules`,
confidence drops to `Low`, an activity-log entry names the failure, and the app keeps
working. A wrong or absent key never produces an error screen. If the browser blocks
a direct cross-origin request (some providers do not allow it), the report falls back
to rules-only, the activity log records `llm.cors_blocked`, and the report shows a
note saying the provider may need a server proxy.

For Anthropic, the request includes the header
`anthropic-dangerous-direct-browser-access: true` so the browser can call the API
directly.

---

## Security note

- **Keys are user-supplied and session-scoped.** They live in this browser's
  `localStorage` and are sent only to the provider you selected. Nothing is
  transmitted anywhere else.
- **There is no server and no shared secret.** Every install is independent; there is
  no backend, database, or auth.
- **Rules-only mode requires no key** and makes no network calls at all
  (`FEATURES.LLM_ENABLED` can also hard-disable calls).
- **A production version would proxy through a backend** so the provider key is held
  server-side, calls are rate-limited and audited, and the browser never sees the
  secret.
- `.env` is git-ignored and unused. Never commit a key.

---

## What's where

```
src/
  config.ts        all constants and feature flags — the only tunables outside src/rules/
  types.ts         every TypeScript type
  rules/           the editable brain (see src/rules/README.md)
  llm/             provider-agnostic fetch wrapper, prompt, strict JSON parse
  store/           localStorage read/write, reports CRUD, activity log, seeds
  screens/         one file per screen
  components/      SeverityBadge, EvidenceHighlight, ReasonChain, StatusPill, Modal, ThorHammer
  styles/          plain CSS with custom properties (tokens / base / screens)
```

The classification pipeline lives entirely in `src/rules/`. Every rules file opens
with a plain-English comment explaining what it does, how to change it, and why it
works that way. Someone who does not write TypeScript can open `severity.ts` and
change a threshold.

### Feature flags (`src/config.ts` → `FEATURES`)

| Flag | Off behaviour |
|---|---|
| `THOR_HAMMER_ENABLED` | Home screen collapses the centre column; the five buttons stack. Layout stays intact. |
| `ACTIVITY_LOG_ENABLED` | No log writes, nav item hidden, `/activity` route unmounted. |
| `LLM_ENABLED` | Rules-only. No network calls ever, whatever the settings say. |
| `SEED_DATA_ENABLED` | First run starts with an empty queue. |
| `DUPLICATE_DETECTION` | No "looks similar to RPT-…" banner on the form. |
| `EVAL_HARNESS_ENABLED` | No "Run all seeds" button on Data files. |

Any single flag can be flipped to `false` and the app still runs.

---

## Using it

1. **New bug report** → paste the report, add customer / Call ID, pick an impact
   level (segmented buttons, no default), optionally a start date, then **Run
   triage**. You land on the report in its in-review state.
2. Review the **Triage results** — two columns: the classification (bucket, secondary
   tags, severity + reason chain, confidence, routing + what to check) on the left,
   the justification (evidence highlighted in the original text, escalations) on the
   right. Below them: the prompts for more info and a **More info** box for anything
   they surface. That text travels to the team you route to.
3. Confirm or override bucket / severity / routing. Any change requires a reason.
   **Route to team** — routing is impossible without this explicit action, and it is
   blocked while confidence is `Low` until you override or tick the confirm box.
4. **Mark resolved** once the fix lands. A modal requires a resolution note (cause +
   fix) before the report closes; it then shows at the top of the resolved report.

**Triage queue** — toggle-button filters (Bucket, Severity, Status, Routing team; OR
within a row, AND across rows) plus a Customer text filter and a **Clear all**
control. Discarded reports are never listed here. Confidence has its own coloured
badge, deliberately not the severity scale. **Activity log** has one row per write
action, with the real before/after values (capped at 1000 chars). **Data files** has
plain-table views (Copy as TSV / Download CSV) and a one-click **Run all seeds** eval
that diffs the pipeline against the answer key.

## Storage schema

`SCHEMA_VERSION` is `2`. A v1 → v2 migration in `store/storage.ts` runs on load and
backfills `more_info` and `resolution_note` as `null` on existing reports without
wiping or reseeding anything — a user with reports in flight keeps them.
