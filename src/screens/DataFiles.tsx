import { useState } from 'react';
import {
  DATA_FILES_COPY,
  DATA_TABLES,
  FEATURES,
  ROUTES,
} from '../config';
import type { EvalRow } from '../types';
import { classifyRulesOnly } from '../rules/pipeline';
import { SEED_INPUTS } from '../store/seed';
import { EXPECTED_SEEDS } from '../rules/__tests__/expected';

/** Plain links to the three table views, plus the one-click eval harness
 *  that re-runs the pipeline over the 15 seeds and diffs against the key. */
export default function DataFiles() {
  const [evalRows, setEvalRows] = useState<EvalRow[] | null>(null);

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
        </>
      )}
    </div>
  );
}
