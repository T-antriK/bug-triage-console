import { useState } from 'react';
import {
  BATCH_TRACE_COPY,
  DATA_FILES_COPY,
  DATA_TABLES,
  FEATURES,
  ROUTES,
} from '../config';
import type {
  EvalRow,
  RulesBucketDetail,
  SeverityDetail,
  TiebreaksDetail,
  TriageInput,
} from '../types';
import { classifyRulesOnly, runPipeline } from '../rules/pipeline';
import { FLOORS } from '../rules/severity';
import { TIEBREAKS } from '../rules/tiebreaks';
import { SEED_INPUTS } from '../store/seed';
import { EXPECTED_SEEDS } from '../rules/__tests__/expected';
import { HOLDOUT } from '../rules/__tests__/holdout';
import { isVerbose } from '../store/storage';

type BatchSummary = {
  runs: number;
  floors: Array<{ id: string; count: number }>;
  tiebreaks: Array<{ name: string; count: number }>;
  patterns: Array<{ keyword: string; count: number }>;
  disagreements: number;
};

/** Plain links to the three table views, plus the one-click eval harness
 *  that re-runs the pipeline over the 15 seeds and diffs against the key.
 *  With verbose mode on, it also captures traces across the 15 seeds and
 *  30 hold-out cases and rolls them up into a batch summary. */
export default function DataFiles() {
  const [evalRows, setEvalRows] = useState<EvalRow[] | null>(null);
  const [batch, setBatch] = useState<BatchSummary | null>(null);
  const verbose = isVerbose();

  function runSeeds() {
    const rows: EvalRow[] = SEED_INPUTS.map((input, i) => {
      const result = classifyRulesOnly(input);
      const exp = EXPECTED_SEEDS[i];
      const bucketPass = result.bucket === exp.bucket;
      const severityPass = result.severity === exp.severity;
      return {
        seedIndex: i + 1,
        bug_report: input.bug_report,
        expectedBucket: exp.bucket,
        expectedSeverity: exp.severity,
        actualBucket: result.bucket,
        actualSeverity: result.severity,
        bucketPass,
        severityPass,
        pass: bucketPass && severityPass,
      };
    });
    setEvalRows(rows);
    setBatch(verbose ? runBatchTrace() : null);
  }

  const passCount = evalRows?.filter((r) => r.pass).length ?? 0;

  return (
    <div className="page">
      <h1>{DATA_FILES_COPY.TITLE}</h1>
      <p className="prose">{DATA_FILES_COPY.INTRO}</p>

      <ul className="data-links">
        {Object.values(DATA_TABLES).map((t) => (
          <li key={t.name}>
            <a
              href={`${ROUTES.DATA_TABLE}/${t.name}`}
              target="_blank"
              rel="noreferrer"
            >
              {t.label}
            </a>
          </li>
        ))}
      </ul>

      {FEATURES.EVAL_HARNESS_ENABLED && (
        <>
          <hr className="section-rule" />
          <h2>{DATA_FILES_COPY.RUN_SEEDS}</h2>
          <p className="prose small muted">{DATA_FILES_COPY.RUN_SEEDS_HINT}</p>
          <button type="button" className="btn btn-primary" onClick={runSeeds}>
            {DATA_FILES_COPY.RUN_SEEDS}
          </button>

          {evalRows && (
            <>
              <p className="eval-summary" style={{ marginTop: 'var(--s-4)' }}>
                {DATA_FILES_COPY.EVAL_SUMMARY_PREFIX}
                <span className={passCount === evalRows.length ? 'eval-pass' : 'eval-fail'}>
                  {passCount}/{evalRows.length}
                  {DATA_FILES_COPY.EVAL_PASS_SUFFIX}
                </span>
              </p>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{DATA_FILES_COPY.EVAL_COL_NUM}</th>
                      <th>{DATA_FILES_COPY.EVAL_COL_REPORT}</th>
                      <th>{DATA_FILES_COPY.EVAL_COL_EXP_BUCKET}</th>
                      <th>{DATA_FILES_COPY.EVAL_COL_ACT_BUCKET}</th>
                      <th>{DATA_FILES_COPY.EVAL_COL_EXP_SEV}</th>
                      <th>{DATA_FILES_COPY.EVAL_COL_ACT_SEV}</th>
                      <th>{DATA_FILES_COPY.EVAL_COL_RESULT}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalRows.map((r) => (
                      <tr key={r.seedIndex}>
                        <td>{r.seedIndex}</td>
                        <td className="wrap">{r.bug_report}</td>
                        <td>{r.expectedBucket}</td>
                        <td className={r.bucketPass ? 'eval-pass' : 'eval-fail'}>
                          {r.actualBucket}
                        </td>
                        <td>{r.expectedSeverity}</td>
                        <td className={r.severityPass ? 'eval-pass' : 'eval-fail'}>
                          {r.actualSeverity}
                        </td>
                        <td className={r.pass ? 'eval-pass' : 'eval-fail'}>
                          {r.pass ? DATA_FILES_COPY.EVAL_PASS : DATA_FILES_COPY.EVAL_FAIL}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {batch && <BatchTraceSummary s={batch} />}
        </>
      )}
    </div>
  );
}

// ---- batch trace: 15 seeds + 30 hold-out cases, rules-only ----
function runBatchTrace(): BatchSummary {
  const inputs: TriageInput[] = [
    ...SEED_INPUTS,
    ...HOLDOUT.map((c) => ({
      bug_report: c.bug_report,
      customer: c.customer,
      call_id: c.call_id,
      started_at: null,
      impact: c.impact,
    })),
  ];

  const floorCount: Record<string, number> = Object.fromEntries(
    FLOORS.map((f) => [f.id, 0]),
  );
  const tiebreakCount: Record<string, number> = Object.fromEntries(
    TIEBREAKS.map((t) => [t.name, 0]),
  );
  const patternCount: Record<string, number> = {};
  let disagreements = 0;

  for (const input of inputs) {
    const traced = runPipeline(input, { llm: null, capture_trace: true });
    const trace = traced.trace;
    if (!trace) continue;

    for (const step of trace.steps) {
      if (step.id === 'severity') {
        const d = step.detail as SeverityDetail;
        for (const f of d.floors) if (f.fired) floorCount[f.id] = (floorCount[f.id] ?? 0) + 1;
      }
      if (step.id === 'tiebreaks') {
        const d = step.detail as TiebreaksDetail;
        for (const e of d.evaluated) if (e.fired) tiebreakCount[e.name] = (tiebreakCount[e.name] ?? 0) + 1;
      }
      if (step.id === 'rules_bucket') {
        const d = step.detail as RulesBucketDetail;
        for (const row of d.per_bucket) {
          for (const h of row.hits) patternCount[h.keyword] = (patternCount[h.keyword] ?? 0) + 1;
        }
      }
    }
    if (traced.rules_bucket && traced.llm_bucket && traced.rules_bucket !== traced.llm_bucket) {
      disagreements++;
    }
  }

  return {
    runs: inputs.length,
    floors: FLOORS.map((f) => ({ id: f.id, count: floorCount[f.id] ?? 0 })),
    tiebreaks: TIEBREAKS.map((t) => ({ name: t.name, count: tiebreakCount[t.name] ?? 0 })),
    patterns: Object.entries(patternCount)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    disagreements,
  };
}

function BatchTraceSummary({ s }: { s: BatchSummary }) {
  return (
    <>
      <hr className="section-rule" />
      <h2>{BATCH_TRACE_COPY.TITLE}</h2>
      <p className="prose small muted">{BATCH_TRACE_COPY.HINT}</p>

      <div className="batch-grid">
        <div>
          <h3>{BATCH_TRACE_COPY.FLOORS_TITLE}</h3>
          <table className="data-table trace-table">
            <thead>
              <tr>
                <th>{BATCH_TRACE_COPY.COL_NAME}</th>
                <th>{BATCH_TRACE_COPY.COL_COUNT}</th>
              </tr>
            </thead>
            <tbody>
              {s.floors.map((f) => (
                <tr key={f.id} className={f.count === 0 ? 'eval-fail' : ''}>
                  <td className="mono-cell">{f.id}</td>
                  <td>
                    {f.count} / {s.runs}
                    {f.count === 0 ? ` — ${BATCH_TRACE_COPY.NEVER_FIRED}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3>{BATCH_TRACE_COPY.TIEBREAKS_TITLE}</h3>
          <table className="data-table trace-table">
            <thead>
              <tr>
                <th>{BATCH_TRACE_COPY.COL_NAME}</th>
                <th>{BATCH_TRACE_COPY.COL_COUNT}</th>
              </tr>
            </thead>
            <tbody>
              {s.tiebreaks.map((t) => (
                <tr key={t.name} className={t.count === 0 ? 'eval-fail' : ''}>
                  <td className="mono-cell">{t.name}</td>
                  <td>
                    {t.count} / {s.runs}
                    {t.count === 0 ? ` — ${BATCH_TRACE_COPY.NEVER_FIRED}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ marginTop: 'var(--s-4)' }}>
        {BATCH_TRACE_COPY.DISAGREEMENT_LINE}
        <strong>{s.disagreements}</strong>
      </p>
      <p className="small muted">{BATCH_TRACE_COPY.RULES_ONLY_NOTE}</p>

      <h3 style={{ marginTop: 'var(--s-4)' }}>{BATCH_TRACE_COPY.PATTERNS_TITLE}</h3>
      <div className="data-table-wrap">
        <table className="data-table trace-table">
          <thead>
            <tr>
              <th>{BATCH_TRACE_COPY.COL_KEYWORD}</th>
              <th>{BATCH_TRACE_COPY.COL_COUNT}</th>
            </tr>
          </thead>
          <tbody>
            {s.patterns.map((p) => (
              <tr key={p.keyword}>
                <td className="mono-cell">{p.keyword}</td>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
