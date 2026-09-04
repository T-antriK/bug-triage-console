import { useState } from 'react';
import { TRACE_COPY } from '../config';
import type {
  ArbitrationDetail,
  ConfidenceDetail,
  EvidenceDetail,
  ImpactEscalationDetail,
  LlmCallDetail,
  NormalizeDetail,
  QuestionsDetail,
  RulesBucketDetail,
  SeverityDetail,
  SignalsMergeDetail,
  TiebreaksDetail,
  Trace,
  TraceStep,
} from '../types';

/**
 * The "Decision trace" section. Collapsed by default; each pipeline step
 * is its own expandable row (one-line summary → structured detail).
 * Rules are named by their id so a reader can jump to the line to edit.
 */
export function DecisionTrace({
  trace,
  headerActions,
}: {
  trace: Trace;
  headerActions?: React.ReactNode;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const allIds = trace.steps.map((s) => s.id);
  const allOpen = open.size === allIds.length;

  function toggle(id: string) {
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="trace">
      <div className="row">
        <h2>{TRACE_COPY.SECTION_TITLE}</h2>
        <span className="spacer" />
        {headerActions}
        <button
          type="button"
          className="btn-link small"
          onClick={() => setOpen(allOpen ? new Set() : new Set(allIds))}
        >
          {allOpen ? TRACE_COPY.COLLAPSE_ALL : TRACE_COPY.EXPAND_ALL}
        </button>
      </div>
      <p className="small muted prose">{TRACE_COPY.SECTION_HINT}</p>

      <div className="trace-steps">
        {trace.steps.map((step, i) => (
          <TraceRow
            key={step.id}
            index={i + 1}
            step={step}
            open={open.has(step.id)}
            onToggle={() => toggle(step.id)}
          />
        ))}
      </div>
    </section>
  );
}

function TraceRow({
  index,
  step,
  open,
  onToggle,
}: {
  index: number;
  step: TraceStep;
  open: boolean;
  onToggle: () => void;
}) {
  const title = TRACE_COPY.STEP_TITLE[step.id];
  return (
    <div className="trace-step">
      <button
        type="button"
        className="trace-step-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="trace-step-num">{index}</span>
        <span className="trace-step-title">{title}</span>
        <span className="trace-step-summary">{step.summary}</span>
        <span className="trace-step-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <div className="trace-step-body">{renderDetail(step)}</div>}
    </div>
  );
}

// ---- tiny presentational helpers ----
function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="trace-kv">
      <span className="trace-kv-label">{label}</span>
      <span className="trace-kv-value">{children}</span>
    </div>
  );
}

function List({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <span className="muted">{empty ?? TRACE_COPY.NONE}</span>;
  return (
    <ul className="trace-list">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function renderDetail(step: TraceStep): React.ReactNode {
  switch (step.id) {
    case 'normalize':
      return <NormalizeView d={step.detail as NormalizeDetail} />;
    case 'rules_bucket':
      return <RulesBucketView d={step.detail as RulesBucketDetail} />;
    case 'llm_call':
      return <LlmCallView d={step.detail as LlmCallDetail} />;
    case 'arbitration':
      return <ArbitrationView d={step.detail as ArbitrationDetail} />;
    case 'tiebreaks':
      return <TiebreaksView d={step.detail as TiebreaksDetail} />;
    case 'signals_merge':
      return <SignalsMergeView d={step.detail as SignalsMergeDetail} />;
    case 'impact_escalation':
      return <ImpactEscalationView d={step.detail as ImpactEscalationDetail} />;
    case 'severity':
      return <SeverityView d={step.detail as SeverityDetail} />;
    case 'confidence':
      return <ConfidenceView d={step.detail as ConfidenceDetail} />;
    case 'evidence':
      return <EvidenceView d={step.detail as EvidenceDetail} />;
    case 'questions':
      return <QuestionsView d={step.detail as QuestionsDetail} />;
    default:
      return null;
  }
}

function NormalizeView({ d }: { d: NormalizeDetail }) {
  return (
    <>
      <KV label={TRACE_COPY.L_ORIGINAL}>
        <code className="trace-code">{d.original}</code>
      </KV>
      <KV label={TRACE_COPY.L_NORMALISED}>
        <code className="trace-code">{d.normalised}</code>
      </KV>
      <KV label={TRACE_COPY.L_CHANGES}>
        <List items={d.changes} />
      </KV>
    </>
  );
}

function RulesBucketView({ d }: { d: RulesBucketDetail }) {
  return (
    <>
      <div className="data-table-wrap">
        <table className="data-table trace-table">
          <thead>
            <tr>
              <th>bucket</th>
              <th>{TRACE_COPY.L_SCORE}</th>
              <th>{TRACE_COPY.L_HITS}</th>
              <th>{TRACE_COPY.L_NEGATIVES}</th>
            </tr>
          </thead>
          <tbody>
            {d.per_bucket.map((r) => (
              <tr key={r.bucket}>
                <td>
                  <strong>{r.bucket}</strong>
                </td>
                <td className="mono-cell">
                  {r.score}
                  {r.raw_score !== r.score ? ` (raw ${r.raw_score})` : ''}
                </td>
                <td className="wrap">
                  {r.hits.length === 0
                    ? '—'
                    : r.hits.map((h) => `"${h.keyword}" @${h.index}`).join(', ')}
                </td>
                <td className="wrap">
                  {r.negatives.length === 0
                    ? '—'
                    : r.negatives.map((n) => `"${n.keyword}" ${n.penalty}`).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <KV label={TRACE_COPY.L_RANKING}>{d.ranking.join(' > ') || '—'}</KV>
      <KV label="contenders">{d.contenders.join(', ') || '—'}</KV>
      <KV label={TRACE_COPY.L_PICKED}>
        {d.picked ?? 'abstained'} <span className="muted">— {d.via_detail}</span>
      </KV>
    </>
  );
}

function LlmCallView({ d }: { d: LlmCallDetail }) {
  if (d.skipped) {
    return <KV label={TRACE_COPY.L_SKIPPED}>{d.reason}</KV>;
  }
  return (
    <>
      <KV label={TRACE_COPY.L_PROVIDER}>{d.provider}</KV>
      <KV label={TRACE_COPY.L_MODEL}>{d.model ?? '—'}</KV>
      <KV label="endpoint">
        <code className="trace-code">{d.endpoint}</code>
      </KV>
      <KV label={TRACE_COPY.L_LATENCY}>
        {d.latency_ms}
        {TRACE_COPY.MS_SUFFIX}
      </KV>
      <KV label={TRACE_COPY.L_HTTP}>{d.http_status ?? '(no response — fetch threw)'}</KV>
      {d.failure && <KV label="failure">{d.failure}</KV>}
      <KV label={TRACE_COPY.L_FIELDS_KEPT}>{d.fields_kept.join(', ') || '—'}</KV>
      <KV label={TRACE_COPY.L_FIELDS_DROPPED}>
        {d.fields_dropped.length === 0 ? (
          '—'
        ) : (
          <List items={d.fields_dropped.map((f) => `${f.field}: ${f.reason}`)} />
        )}
      </KV>
      <KV label={TRACE_COPY.L_RAW_BODY}>
        <pre className="trace-pre">{d.raw_body || '(empty)'}</pre>
      </KV>
    </>
  );
}

function ArbitrationView({ d }: { d: ArbitrationDetail }) {
  return (
    <>
      <KV label={TRACE_COPY.L_RULES_BUCKET}>{d.rules_bucket ?? '—'}</KV>
      <KV label={TRACE_COPY.L_MODEL_BUCKET}>{d.llm_bucket ?? '—'}</KV>
      <KV label={TRACE_COPY.L_AGREED}>
        {d.agreed === null ? '—' : d.agreed ? TRACE_COPY.YES : TRACE_COPY.NO}
      </KV>
      <KV label={TRACE_COPY.L_WINNER}>
        <strong>{d.winner}</strong>
      </KV>
      <KV label={TRACE_COPY.L_RULE}>
        {d.rule} <span className="muted">— {d.rule_detail}</span>
      </KV>
    </>
  );
}

function TiebreaksView({ d }: { d: TiebreaksDetail }) {
  return (
    <>
      <KV label={TRACE_COPY.L_RAN}>
        {d.ran ? TRACE_COPY.YES : `${TRACE_COPY.NO} — ${d.not_run_reason}`}
      </KV>
      <KV label="contenders">{d.contenders.join(', ') || '—'}</KV>
      <div className="data-table-wrap">
        <table className="data-table trace-table">
          <thead>
            <tr>
              <th>name</th>
              <th>boundary rule</th>
              <th>{TRACE_COPY.L_FIRED}</th>
              <th>picked</th>
            </tr>
          </thead>
          <tbody>
            {d.evaluated.map((e) => (
              <tr key={e.name} className={e.fired ? 'trace-fired' : ''}>
                <td className="mono-cell">{e.name}</td>
                <td className="wrap">{e.plain_english}</td>
                <td>{e.fired ? TRACE_COPY.YES : TRACE_COPY.NO}</td>
                <td>{e.picked ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SignalsMergeView({ d }: { d: SignalsMergeDetail }) {
  if (!d.llm_present) {
    return <p className="muted">Rules-only — no model signals to merge.</p>;
  }
  return (
    <div className="data-table-wrap">
      <table className="data-table trace-table">
        <thead>
          <tr>
            <th>{TRACE_COPY.L_SIGNAL}</th>
            <th>{TRACE_COPY.L_RULES_VALUE}</th>
            <th>{TRACE_COPY.L_MODEL_VALUE}</th>
            <th>{TRACE_COPY.L_MERGED}</th>
            <th>{TRACE_COPY.L_SOURCE}</th>
          </tr>
        </thead>
        <tbody>
          {d.per_signal.map((r) => (
            <tr key={r.signal} className={r.source === 'llm' ? 'trace-fired' : ''}>
              <td className="mono-cell">{r.signal}</td>
              <td>{r.rules_value}</td>
              <td>{r.llm_value ?? '—'}</td>
              <td>
                <strong>{r.merged}</strong>
              </td>
              <td>{r.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImpactEscalationView({ d }: { d: ImpactEscalationDetail }) {
  return (
    <>
      <KV label={TRACE_COPY.L_DROPDOWN}>{d.dropdown}</KV>
      <KV label={TRACE_COPY.L_EFFECTIVE}>
        <strong>{d.effective}</strong>
        {d.escalated ? ` (escalated from ${d.escalated_from})` : ''}
      </KV>
      <KV label={TRACE_COPY.L_TRIGGER}>
        {d.trigger_keywords.length ? d.trigger_keywords.join(', ') : '—'}
      </KV>
      <KV label={TRACE_COPY.L_NARROWER}>
        {d.narrower_flag ? `${TRACE_COPY.YES} (${d.narrower_keywords.join(', ')})` : TRACE_COPY.NO}
      </KV>
    </>
  );
}

function SeverityView({ d }: { d: SeverityDetail }) {
  return (
    <>
      <KV label={TRACE_COPY.L_SHORT_CIRCUIT}>
        {d.short_circuit ? `${TRACE_COPY.YES} — ${d.short_circuit_reason}` : TRACE_COPY.NO}
      </KV>
      {d.base && (
        <KV label={TRACE_COPY.L_BASE}>
          {d.base.radius} × {d.base.functional_loss} → <strong>{d.base.cell}</strong>
        </KV>
      )}
      {!d.short_circuit && (
        <>
          <p className="small muted" style={{ marginTop: 'var(--s-2)' }}>
            {TRACE_COPY.FLOOR_NOTE}
          </p>
          <div className="data-table-wrap">
            <table className="data-table trace-table">
              <thead>
                <tr>
                  <th>{TRACE_COPY.FLOOR_COL_ID}</th>
                  <th>{TRACE_COPY.FLOOR_COL_CONDITION}</th>
                  <th>{TRACE_COPY.FLOOR_COL_VALUES}</th>
                  <th>{TRACE_COPY.FLOOR_COL_FIRED}</th>
                  <th>{TRACE_COPY.FLOOR_COL_LEVEL}</th>
                </tr>
              </thead>
              <tbody>
                {d.floors.map((f) => (
                  <tr key={f.id} className={f.fired ? 'trace-fired' : ''}>
                    <td className="mono-cell">{f.id}</td>
                    <td className="wrap">{f.condition}</td>
                    <td className="wrap mono-cell">
                      {Object.entries(f.signal_values)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ')}
                    </td>
                    <td>
                      {f.fired ? TRACE_COPY.YES : TRACE_COPY.NO}
                      {f.fired ? ` (floor ${f.floor_level})` : ''}
                    </td>
                    <td>
                      <strong>{f.level_after}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <KV label={TRACE_COPY.L_SILENT_MOD}>
        silent_failure={d.silent_modifier.silent_failure ? TRACE_COPY.YES : TRACE_COPY.NO}, gate
        passed={d.silent_modifier.gate_passed ? TRACE_COPY.YES : TRACE_COPY.NO},{' '}
        {d.silent_modifier.applied
          ? `applied: ${d.silent_modifier.level_before} → ${d.silent_modifier.level_after} (cap ${d.silent_modifier.cap})`
          : 'not applied'}
      </KV>
      <KV label={TRACE_COPY.L_FINAL_LEVEL}>
        <strong>{d.final_level}</strong>
      </KV>
    </>
  );
}

function ConfidenceView({ d }: { d: ConfidenceDetail }) {
  return (
    <>
      <KV label={TRACE_COPY.L_BRANCH}>{d.branch}</KV>
      <KV label="inputs">
        <span className="mono-cell">
          mode={d.inputs.mode}, rules_bucket={d.inputs.rules_bucket ?? '-'}, model_bucket=
          {d.inputs.llm_bucket ?? '-'}, llm_failed={String(d.inputs.llm_failed)}, rules_top_score=
          {d.inputs.rules_top_score}, evidence_verified={d.inputs.evidence_verified_count}
        </span>
      </KV>
      <KV label={TRACE_COPY.L_RESULT}>
        <strong>{d.result}</strong>
      </KV>
    </>
  );
}

function EvidenceView({ d }: { d: EvidenceDetail }) {
  return (
    <>
      <KV label={TRACE_COPY.L_RULES_SPANS}>
        <List
          items={d.rules_spans.map((s) => `"${s.text}" → ${s.supports}`)}
          empty="none"
        />
      </KV>
      <KV label={TRACE_COPY.L_LLM_SPANS_KEPT}>
        <List
          items={d.llm_spans_verified.map((s) => `"${s.text}" → ${s.supports}`)}
          empty="none"
        />
      </KV>
      <KV label={TRACE_COPY.L_LLM_SPANS_DROPPED}>
        <List
          items={d.llm_spans_dropped.map((s) => `"${s.text}" — ${s.reason}`)}
          empty="none"
        />
      </KV>
      <KV label={TRACE_COPY.L_MERGE_DECISIONS}>
        <List items={d.merge_decisions} />
      </KV>
      <KV label={TRACE_COPY.L_FINAL_COUNT}>{d.final_count}</KV>
    </>
  );
}

function QuestionsView({ d }: { d: QuestionsDetail }) {
  return (
    <>
      <KV label={TRACE_COPY.L_BASE_BANK}>
        <List items={d.base_bank} />
      </KV>
      <KV label={TRACE_COPY.L_CONDITIONALS_FIRED}>
        <List
          items={d.conditionals_fired.map((c) => `${c.ask}  —  (${c.why})`)}
          empty="none fired"
        />
      </KV>
      <KV label={TRACE_COPY.L_LLM_EXTRA}>{d.llm_extra ?? '—'}</KV>
      <KV label={TRACE_COPY.L_CUT_BY_CAP}>
        <List items={d.cut_by_cap} empty="nothing cut" />
      </KV>
      <KV label={TRACE_COPY.L_FINAL}>
        <List items={d.final} />
      </KV>
    </>
  );
}
