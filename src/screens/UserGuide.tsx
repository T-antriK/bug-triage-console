import {
  BUCKET_LABELS,
  GUIDE_IMAGE_BASE,
  ROUTES,
  SEVERITY_LABELS,
} from '../config';
import { BUCKETS } from '../rules/buckets';
import { BASE_GRID } from '../rules/severity';

/**
 * One scrollable page. Prose is documentation, not tunable config, so it
 * lives here; every label that also drives logic (bucket names, severity
 * labels, the base grid) is imported so the guide can never drift from
 * the engine. Screenshot placeholders load from public/guide/ with alt
 * text describing what each should show.
 */
function Shot({ file, alt }: { file: string; alt: string }) {
  return <img src={`${GUIDE_IMAGE_BASE}${file}`} alt={alt} loading="lazy" />;
}

export default function UserGuide() {
  return (
    <div className="page guide prose">
      <h1>User guide</h1>

      <h2>What this tool does</h2>
      <p>
        You paste a messy bug report about the production voice agent. The console
        returns a recommended bucket, a severity, a routing team, a confidence level,
        the evidence it used, and prompts for more info. Nothing is routed until a
        human confirms. The original recommendation is always kept, even after an
        override, so you can see what changed and why.
      </p>
      <Shot file="home.svg" alt="The home screen: five navigation buttons around the Thor scene." />

      <h2>The five buckets</h2>
      <p>A bucket answers which layer of the stack got it wrong.</p>
      <table className="rubric">
        <thead>
          <tr>
            <th>Bucket</th>
            <th>Boundary rule</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(BUCKETS) as Array<keyof typeof BUCKETS>).map((id) => (
            <tr key={id}>
              <td>
                {id} — {BUCKET_LABELS[id]}
              </td>
              <td>{BUCKETS[id].boundary}</td>
              <td>{BUCKETS[id].owner}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>The severity rubric</h2>
      <p>
        Severity answers one question: what does it cost to wait? Not how many people
        complained, and not how loud the failure is. The base grid is blast radius by
        loss of function; floors then raise the level for things that escalate
        regardless of caller count.
      </p>
      <table className="rubric">
        <thead>
          <tr>
            <th>Blast radius</th>
            <th>Broken</th>
            <th>Degraded</th>
            <th>Cosmetic</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Many callers</td>
            <td>{BASE_GRID.many.broken}</td>
            <td>{BASE_GRID.many.degraded}</td>
            <td>{BASE_GRID.many.cosmetic}</td>
          </tr>
          <tr>
            <td>Single caller</td>
            <td>{BASE_GRID.single.broken}</td>
            <td>{BASE_GRID.single.degraded}</td>
            <td>{BASE_GRID.single.cosmetic}</td>
          </tr>
        </tbody>
      </table>
      <ul>
        {(Object.keys(SEVERITY_LABELS) as Array<keyof typeof SEVERITY_LABELS>).map((s) => (
          <li key={s}>{SEVERITY_LABELS[s]}</li>
        ))}
      </ul>

      <h2>Four cases where blast radius alone gets it wrong</h2>
      <ol>
        <li>
          A single-caller report carrying legal exposure. One threatened caller is a
          Sev1, not a Sev3, because caller count is close to irrelevant to legal risk.
        </li>
        <li>
          A cosmetic-sounding bug where the customer acts on the wrong output. A
          mis-spoken dollar amount is materially wrong output, not a cosmetic glitch.
        </li>
        <li>
          A silent failure. No error surfaced and the call looked normal, so the damage
          accrues undetected until reconciliation. It gets a one-level bump.
        </li>
        <li>
          Ongoing data loss at scale. The cleanup window grows every hour, so it is a
          Sev0 even before anyone has quantified the blast radius.
        </li>
      </ol>

      <h2>How to submit a report</h2>
      <p>
        Open <a href={ROUTES.REPORT_NEW}>New bug report</a>, paste the report verbatim,
        add the customer and a Call ID if you have one, pick an impact level (there is
        no default), and run triage. You land straight on the report in its in-review
        state. Save a draft any time; drafts stay editable until you submit.
      </p>
      <Shot file="report-form.svg" alt="The report form in draft state with the five input fields." />

      <h2>Triage results, more info, and overriding</h2>
      <p>
        After triage the <strong>Triage results</strong> are read-only: the
        classification on the left, the evidence and escalations on the right. Use the{' '}
        <strong>More info</strong> box under the prompts to record anything the prompts
        surfaced — it travels to the team you route to. The override block is pre-filled
        with the computed values. Change the bucket, severity or routing team if you
        disagree; a reason field appears and is mandatory. Routing to “Other” needs a
        team name. Click <strong>Route to team</strong> to confirm. Low confidence
        blocks routing until you either override or tick the confirm box. On{' '}
        <strong>Mark resolved</strong> you must document the cause and the fix before
        the report closes.
      </p>
      <Shot file="in-review.svg" alt="A report in review showing evidence highlights and the override block." />

      <h2>What the confidence levels mean</h2>
      <ul>
        <li>
          <strong>High</strong> — the keyword engine and the language model picked the
          same bucket and the evidence spans verified.
        </li>
        <li>
          <strong>Medium</strong> — they agreed but the support is thin, or only one
          method produced a bucket.
        </li>
        <li>
          <strong>Low</strong> — they disagreed, the rules score was weak, or the model
          call failed. Routing is held until a human decides.
        </li>
      </ul>

      <h2>Where the data lives and how to export it</h2>
      <p>
        Everything is in your browser’s localStorage — no server, no database. The{' '}
        <a href={ROUTES.DATA}>Data files</a> screen has plain-table views of reports,
        the activity log and feedback, each with Copy as TSV and Download CSV. The
        activity log records one row per write action.
      </p>
      <Shot file="data-files.svg" alt="The data files screen with links to the three tables and the Run all seeds button." />
    </div>
  );
}
