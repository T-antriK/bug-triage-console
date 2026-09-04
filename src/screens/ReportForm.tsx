import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BUCKET_IDS,
  BUCKET_LABELS,
  COMMON,
  FEATURES,
  FIELD_IDS,
  IMPACT_BUTTON_IDS,
  IMPACT_LABELS,
  IMPACT_OPTIONS,
  MESSAGES,
  QUEUE_COPY,
  REPORT_COPY,
  ROUTES,
  ROUTING_TEAMS,
  SEVERITY_LEVELS,
  UI,
  VALIDATION,
  VALIDATION_MESSAGES,
} from '../config';
import type {
  BucketId,
  Impact,
  ReportStatus,
  RoutingTeam,
  SeverityLevel,
  TriageInput,
  TriageReport,
} from '../types';
import {
  createDraft,
  discardReport,
  getReport,
  readReports,
  resolveReport,
  routeReport,
  submitReport,
  updateDraft,
  updateMoreInfo,
} from '../store/reports';
import { runTriage } from '../lib/triage';
import { formatDate } from '../lib/format';
import { findDuplicate } from '../rules/duplicates';
import { toast } from '../lib/toast';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatusPill } from '../components/StatusPill';
import { EvidenceHighlight } from '../components/EvidenceHighlight';
import { ReasonChain } from '../components/ReasonChain';
import { Modal } from '../components/Modal';
import { ROUTING } from '../rules/routing';

type FormFields = {
  bug_report: string;
  customer: string;
  call_id: string;
  started_at: string; // 'YYYY-MM-DD'
  impact: Impact | ''; // no default — the user must choose
};

const EMPTY_FIELDS: FormFields = {
  bug_report: '',
  customer: '',
  call_id: '',
  started_at: '',
  impact: '',
};

function toInput(f: FormFields): TriageInput {
  return {
    bug_report: f.bug_report.trim(),
    customer: f.customer.trim(),
    call_id: f.call_id.trim() || null,
    started_at: f.started_at.trim() || null,
    impact: (f.impact || 'many') as Impact,
  };
}

function fieldsFromReport(r: TriageReport): FormFields {
  return {
    bug_report: r.bug_report,
    customer: r.customer,
    call_id: r.call_id ?? '',
    started_at: r.started_at ?? '',
    impact: r.impact,
  };
}

export default function ReportForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const backTo = useMemo(() => {
    const back = sp.get('back');
    return back ? `${ROUTES.QUEUE}?${back}` : ROUTES.QUEUE;
  }, [sp]);

  const [report, setReport] = useState<TriageReport | null>(null);
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false); // guards against a double-click racing the state update
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');

  // override controls (only meaningful in in_review)
  const [ovBucket, setOvBucket] = useState<BucketId>('INFRA');
  const [ovSeverity, setOvSeverity] = useState<SeverityLevel>('Sev3');
  const [ovRouting, setOvRouting] = useState<RoutingTeam>('Platform/Infra');
  const [ovOther, setOvOther] = useState('');
  const [ovReason, setOvReason] = useState('');
  const [lowConfConfirmed, setLowConfConfirmed] = useState(false);

  // more-info: local text + a debounced write
  const [moreInfo, setMoreInfo] = useState('');
  const moreInfoTimer = useRef<number | null>(null);
  const moreInfoDirty = useRef(false);

  const flushMoreInfo = useCallback(
    (reportId: string | undefined) => {
      if (moreInfoTimer.current) {
        window.clearTimeout(moreInfoTimer.current);
        moreInfoTimer.current = null;
      }
      if (reportId && moreInfoDirty.current) {
        updateMoreInfo(reportId, moreInfo);
        moreInfoDirty.current = false;
      }
    },
    [moreInfo],
  );

  const load = useCallback(() => {
    if (!id) {
      setReport(null);
      setFields(EMPTY_FIELDS);
      return;
    }
    const r = getReport(id);
    if (!r) {
      navigate(ROUTES.QUEUE, { replace: true });
      return;
    }
    setReport(r);
    setFields(fieldsFromReport(r));
    setOvBucket(r.bucket_final);
    setOvSeverity(r.severity_final);
    setOvRouting(r.routing_final);
    setOvOther(r.routing_other_text ?? '');
    setOvReason(r.override_reason ?? '');
    setLowConfConfirmed(false);
    setMoreInfo(r.more_info ?? '');
    moreInfoDirty.current = false;
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // flush any pending more-info write on unmount
  useEffect(() => {
    return () => {
      if (moreInfoTimer.current) window.clearTimeout(moreInfoTimer.current);
    };
  }, []);

  const status: ReportStatus = report?.status ?? 'draft';
  const editable = !report || status === 'draft';
  const inReview = status === 'in_review';
  const routed = status === 'routed';
  const resolved = status === 'resolved';
  const discarded = status === 'discarded';

  const duplicate = useMemo(() => {
    if (!FEATURES.DUPLICATE_DETECTION || !editable) return null;
    const text = fields.bug_report.trim();
    if (text.length < VALIDATION.BUG_REPORT_MIN_CHARS) return null;
    return findDuplicate(text, readReports(), report?.id);
  }, [fields.bug_report, editable, report?.id]);

  const overrideTouched =
    !!report &&
    (ovBucket !== report.bucket ||
      ovSeverity !== report.severity ||
      ovRouting !== report.routing_suggestion);

  const reasonRequired = overrideTouched;
  const otherRequired = ovRouting === 'Other';

  function set<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function pickImpact(next: Impact) {
    if (!editable) return;
    set('impact', next);
    setErrors((e) => {
      if (!e[FIELD_IDS.IMPACT]) return e;
      const { [FIELD_IDS.IMPACT]: _drop, ...rest } = e;
      return rest;
    });
  }

  function onImpactKey(e: React.KeyboardEvent) {
    if (!editable) return;
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const cur = fields.impact ? IMPACT_OPTIONS.indexOf(fields.impact) : -1;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const nextIdx = (cur + dir + IMPACT_OPTIONS.length) % IMPACT_OPTIONS.length;
    pickImpact(IMPACT_OPTIONS[nextIdx]);
  }

  function validateInput(): boolean {
    const next: Record<string, string> = {};
    const text = fields.bug_report.trim();
    if (text.length < VALIDATION.BUG_REPORT_MIN_CHARS) {
      next[FIELD_IDS.BUG_REPORT] = VALIDATION_MESSAGES.BUG_REPORT_TOO_SHORT;
    } else if (text.length > VALIDATION.BUG_REPORT_MAX_CHARS) {
      next[FIELD_IDS.BUG_REPORT] = VALIDATION_MESSAGES.BUG_REPORT_TOO_LONG;
    }
    if (fields.customer.trim().length > VALIDATION.CUSTOMER_MAX_CHARS) {
      next[FIELD_IDS.CUSTOMER] = VALIDATION_MESSAGES.CUSTOMER_TOO_LONG;
    }
    if (!fields.impact) {
      next[FIELD_IDS.IMPACT] = VALIDATION_MESSAGES.IMPACT_REQUIRED;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function onSaveDraft() {
    if (!validateInput()) return;
    if (!report) {
      const created = createDraft(toInput(fields));
      setReport(created);
      navigate(`${ROUTES.REPORT}/${created.id}`, { replace: true });
    } else {
      updateDraft(report.id, toInput(fields));
      load();
    }
    toast(MESSAGES.DRAFT_SAVED);
  }

  async function onSubmit() {
    if (submitLock.current || submitting) return;
    if (!validateInput()) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      let workingId: string;
      if (!report) {
        const created = createDraft(toInput(fields));
        setReport(created);
        workingId = created.id;
      } else {
        updateDraft(report.id, toInput(fields));
        workingId = report.id;
      }
      const { result, notice } = await runTriage(toInput(fields), workingId);
      submitReport(
        workingId,
        result,
        result.llm_provider,
        result.llm_model,
      );
      // land on the report page in its in-review state; toast there
      navigate(`${ROUTES.REPORT}/${workingId}`);
      toast(notice ?? MESSAGES.TRIAGE_DONE);
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  function onDiscard() {
    setConfirmDiscard(true);
  }

  function doDiscard() {
    if (report) discardReport(report.id);
    setConfirmDiscard(false);
    navigate(backTo);
  }

  function onMoreInfoChange(text: string) {
    setMoreInfo(text);
    moreInfoDirty.current = true;
    if (moreInfoTimer.current) window.clearTimeout(moreInfoTimer.current);
    moreInfoTimer.current = window.setTimeout(() => {
      if (report) {
        updateMoreInfo(report.id, text);
        moreInfoDirty.current = false;
      }
    }, UI.MORE_INFO_DEBOUNCE_MS);
  }

  function onRoute() {
    if (!report) return;
    const next: Record<string, string> = {};
    if (reasonRequired && ovReason.trim().length < VALIDATION.REASON_MIN_CHARS) {
      next[FIELD_IDS.OVERRIDE_REASON] = VALIDATION_MESSAGES.REASON_REQUIRED;
    }
    if (otherRequired && ovOther.trim().length === 0) {
      next[FIELD_IDS.OVERRIDE_ROUTING_OTHER] = VALIDATION_MESSAGES.ROUTING_OTHER_REQUIRED;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    flushMoreInfo(report.id); // persist any pending more-info before the state closes

    const updated = routeReport(report.id, {
      bucket_final: ovBucket,
      severity_final: ovSeverity,
      routing_final: ovRouting,
      routing_other_text: ovRouting === 'Other' ? ovOther.trim() : null,
      override_reason: reasonRequired ? ovReason.trim() : null,
    });
    if (updated) {
      toast(
        MESSAGES.REPORT_ROUTED_PREFIX +
          (updated.routing_final === 'Other'
            ? updated.routing_other_text ?? 'Other'
            : updated.routing_final),
      );
      setReport(updated);
      load();
    }
  }

  function confirmResolve() {
    if (!report) return;
    if (resolutionNote.trim().length < VALIDATION.RESOLUTION_MIN_CHARS) return;
    const updated = resolveReport(report.id, resolutionNote.trim());
    if (updated) {
      setResolveOpen(false);
      setResolutionNote('');
      toast(MESSAGES.REPORT_RESOLVED);
      setReport(updated);
      load();
    }
  }

  function copyQuestions() {
    if (!report) return;
    navigator.clipboard
      ?.writeText(report.next_questions.map((q) => `- ${q}`).join('\n'))
      .then(() => toast(REPORT_COPY.QUESTIONS_COPIED))
      .catch(() => undefined);
  }

  const routeBlocked =
    inReview && report?.confidence === 'Low' && !overrideTouched && !lowConfConfirmed;

  const resolutionValid = resolutionNote.trim().length >= VALIDATION.RESOLUTION_MIN_CHARS;

  const title = report
    ? `${REPORT_COPY.TITLE_EXISTING}${report.id}`
    : REPORT_COPY.TITLE_NEW;

  const showFallbackNote =
    !!report && !editable && report.classifier_mode === 'rules' && !!report.llm_provider;

  return (
    <div className="page report-form">
      <div className="row">
        <h1>{title}</h1>
        {report && <StatusPill status={report.status} />}
        <span className="spacer" />
        <button type="button" className="btn-link" onClick={() => navigate(backTo)}>
          {QUEUE_COPY.BACK}
        </button>
      </div>

      {/* ---- resolution note, shown first once the report is closed ---- */}
      {resolved && report?.resolution_note && (
        <div className="resolution-block">
          <h2>{REPORT_COPY.SECTION_RESOLUTION}</h2>
          <p>{report.resolution_note}</p>
          <p className="small muted">Resolved {formatDate(report.resolved_at)}</p>
        </div>
      )}

      {/* ---- input fields ---- */}
      <div className="report-input-grid">
        <div className="field span-2">
          <label htmlFor={FIELD_IDS.BUG_REPORT}>{REPORT_COPY.LABEL_BUG_REPORT}</label>
          <textarea
            id={FIELD_IDS.BUG_REPORT}
            value={fields.bug_report}
            disabled={!editable}
            maxLength={VALIDATION.BUG_REPORT_MAX_CHARS}
            onChange={(e) => set('bug_report', e.target.value)}
          />
          <span className="help">{REPORT_COPY.HELP_BUG_REPORT}</span>
          {errors[FIELD_IDS.BUG_REPORT] && (
            <span className="error">{errors[FIELD_IDS.BUG_REPORT]}</span>
          )}
        </div>

        <div className="field">
          <label htmlFor={FIELD_IDS.CUSTOMER}>{REPORT_COPY.LABEL_CUSTOMER}</label>
          <input
            id={FIELD_IDS.CUSTOMER}
            type="text"
            value={fields.customer}
            disabled={!editable}
            maxLength={VALIDATION.CUSTOMER_MAX_CHARS + 1}
            onChange={(e) => set('customer', e.target.value)}
          />
          {errors[FIELD_IDS.CUSTOMER] && (
            <span className="error">{errors[FIELD_IDS.CUSTOMER]}</span>
          )}
        </div>

        <div className="field">
          <span className="field-label" id={`${FIELD_IDS.IMPACT}-label`}>
            {REPORT_COPY.LABEL_IMPACT}
          </span>
          <div
            id={FIELD_IDS.IMPACT}
            className="segmented"
            role="radiogroup"
            aria-labelledby={`${FIELD_IDS.IMPACT}-label`}
            onKeyDown={onImpactKey}
          >
            {IMPACT_OPTIONS.map((o) => {
              const selected = fields.impact === o;
              return (
                <button
                  key={o}
                  type="button"
                  id={IMPACT_BUTTON_IDS[o]}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected || (!fields.impact && o === IMPACT_OPTIONS[0]) ? 0 : -1}
                  className={`seg-btn${selected ? ' seg-btn-on' : ''}`}
                  disabled={!editable}
                  onClick={() => pickImpact(o)}
                >
                  {IMPACT_LABELS[o]}
                </button>
              );
            })}
          </div>
          {errors[FIELD_IDS.IMPACT] && (
            <span className="error">{errors[FIELD_IDS.IMPACT]}</span>
          )}
        </div>

        <div className="field">
          <label htmlFor={FIELD_IDS.CALL_ID}>{REPORT_COPY.LABEL_CALL_ID}</label>
          <input
            id={FIELD_IDS.CALL_ID}
            type="text"
            className="mono"
            value={fields.call_id}
            disabled={!editable}
            onChange={(e) => set('call_id', e.target.value)}
          />
          <span className="help">{REPORT_COPY.HELP_CALL_ID}</span>
        </div>

        <div className="field">
          <label htmlFor={FIELD_IDS.STARTED_AT}>{REPORT_COPY.LABEL_STARTED_AT}</label>
          <input
            id={FIELD_IDS.STARTED_AT}
            type="date"
            value={fields.started_at}
            disabled={!editable}
            onChange={(e) => set('started_at', e.target.value)}
          />
          <span className="help">{REPORT_COPY.HELP_STARTED_AT}</span>
        </div>
      </div>

      {FEATURES.DUPLICATE_DETECTION && duplicate && (
        <div className="callout warn">
          {REPORT_COPY.DUPLICATE_PREFIX}
          {duplicate.id}
          {REPORT_COPY.DUPLICATE_SUFFIX}
        </div>
      )}

      {/* ---- draft actions ---- */}
      {editable && (
        <div className="row">
          <button
            type="button"
            id={FIELD_IDS.BTN_DISCARD}
            className="btn"
            onClick={onDiscard}
          >
            {REPORT_COPY.BTN_DISCARD}
          </button>
          <button
            type="button"
            id={FIELD_IDS.BTN_SAVE}
            className="btn"
            onClick={onSaveDraft}
          >
            {REPORT_COPY.BTN_SAVE}
          </button>
          <button
            type="button"
            id={FIELD_IDS.BTN_SUBMIT}
            className="btn btn-primary"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? '…' : REPORT_COPY.BTN_SUBMIT}
          </button>
        </div>
      )}

      {/* ---- triage results ---- */}
      {report && !editable && (
        <>
          <hr className="section-rule" />
          <h2>{REPORT_COPY.SECTION_RESULTS}</h2>

          {showFallbackNote && (
            <div className="callout warn">
              {REPORT_COPY.LLM_FALLBACK_NOTE_PREFIX}
              {report.llm_provider}
              {REPORT_COPY.LLM_FALLBACK_NOTE_SUFFIX}
            </div>
          )}

          <div className="results-cols">
            {/* left column — the classification */}
            <div className="results-col">
              <div className="rec-block">
                <h3>{REPORT_COPY.SECTION_BUCKET}</h3>
                <strong>
                  {report.bucket} — {BUCKET_LABELS[report.bucket]}
                </strong>
                {report.rules_bucket &&
                  report.llm_bucket &&
                  report.rules_bucket !== report.llm_bucket && (
                    <p className="small muted">
                      {REPORT_COPY.DISAGREEMENT_PREFIX}
                      {report.rules_bucket}
                      {REPORT_COPY.DISAGREEMENT_MID}
                      {report.llm_bucket}
                      {REPORT_COPY.DISAGREEMENT_REASON}
                      {report.rules_matched_patterns && report.rules_matched_patterns.length > 0
                        ? report.rules_matched_patterns.join(', ')
                        : 'none'}
                      {REPORT_COPY.DISAGREEMENT_SUFFIX}
                    </p>
                  )}
              </div>

              <div className="rec-block">
                <h3>{REPORT_COPY.SECTION_SECONDARY_TAGS}</h3>
                {report.secondary_tags.length > 0 ? (
                  <div className="row">
                    {report.secondary_tags.map((t) => (
                      <span className="tag" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="muted" title={REPORT_COPY.SECONDARY_TAGS_EMPTY_TIP}>
                    {COMMON.NONE_DASH}
                  </span>
                )}
              </div>

              <div className="rec-block">
                <h3>{REPORT_COPY.SECTION_SEVERITY}</h3>
                <SeverityBadge level={report.severity} />
                <div style={{ marginTop: 'var(--s-2)' }}>
                  <p className="small muted">{REPORT_COPY.SECTION_REASON_CHAIN}</p>
                  <ReasonChain reasons={report.reason_chain} />
                </div>
                {report.impact_escalated_from && (
                  <div className="callout warn">
                    {REPORT_COPY.IMPACT_ESCALATED_PREFIX}
                    {IMPACT_LABELS[report.impact_escalated_from]}
                    {REPORT_COPY.IMPACT_ESCALATED_SUFFIX}
                  </div>
                )}
                {report.narrower_than_selected && (
                  <div className="callout warn">{REPORT_COPY.NARROWER_FLAG}</div>
                )}
              </div>

              <div className="rec-block">
                <h3>{REPORT_COPY.SECTION_CONFIDENCE}</h3>
                <p>{report.confidence}</p>
                {report.confidence === 'Low' && (
                  <p className="callout warn small">{REPORT_COPY.LOW_CONFIDENCE_NOTE}</p>
                )}
              </div>

              <div className="rec-block">
                <h3>{REPORT_COPY.SECTION_ROUTING}</h3>
                <strong>{report.routing_suggestion}</strong>
                <p className="small muted">
                  {REPORT_COPY.WHAT_TO_CHECK}
                  {ROUTING[report.bucket].check}
                </p>
              </div>
            </div>

            {/* right column — the justification */}
            <div className="results-col">
              <div className="rec-block">
                <h3>{REPORT_COPY.SECTION_EVIDENCE}</h3>
                <EvidenceHighlight text={report.bug_report} spans={report.evidence} />
              </div>

              <div className="rec-block">
                <h3>{REPORT_COPY.SECTION_ESCALATIONS}</h3>
                {report.escalations.length > 0 ? (
                  <ul className="questions-list">
                    {report.escalations.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted">{COMMON.NONE_DASH}</span>
                )}
              </div>
            </div>
          </div>

          {/* prompts + more info span the full width */}
          <div className="rec-block">
            <div className="row">
              <h3>{REPORT_COPY.SECTION_QUESTIONS}</h3>
              <button type="button" className="btn-link" onClick={copyQuestions}>
                {REPORT_COPY.COPY_QUESTIONS}
              </button>
            </div>
            <ul className="questions-list">
              {report.next_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>

            <div className="field" style={{ marginTop: 'var(--s-3)' }}>
              <label htmlFor={FIELD_IDS.MORE_INFO}>{REPORT_COPY.LABEL_MORE_INFO}</label>
              <textarea
                id={FIELD_IDS.MORE_INFO}
                rows={4}
                value={moreInfo}
                disabled={!inReview}
                maxLength={VALIDATION.MORE_INFO_MAX_CHARS}
                placeholder={REPORT_COPY.PLACEHOLDER_MORE_INFO}
                onChange={(e) => onMoreInfoChange(e.target.value)}
              />
              <span className="help">{REPORT_COPY.HELP_MORE_INFO}</span>
            </div>
          </div>

          {/* ---- override block ---- */}
          <hr className="section-rule" />
          <h2>{REPORT_COPY.SECTION_OVERRIDE}</h2>
          <div className="override-grid">
            <div className="field">
              <label htmlFor={FIELD_IDS.OVERRIDE_BUCKET}>
                {REPORT_COPY.LABEL_OVERRIDE_BUCKET}
              </label>
              <select
                id={FIELD_IDS.OVERRIDE_BUCKET}
                value={ovBucket}
                disabled={!inReview}
                onChange={(e) => setOvBucket(e.target.value as BucketId)}
              >
                {BUCKET_IDS.map((b) => (
                  <option key={b} value={b}>
                    {b} — {BUCKET_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor={FIELD_IDS.OVERRIDE_SEVERITY}>
                {REPORT_COPY.LABEL_OVERRIDE_SEVERITY}
              </label>
              <select
                id={FIELD_IDS.OVERRIDE_SEVERITY}
                value={ovSeverity}
                disabled={!inReview}
                onChange={(e) => setOvSeverity(e.target.value as SeverityLevel)}
              >
                {SEVERITY_LEVELS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor={FIELD_IDS.OVERRIDE_ROUTING}>
                {REPORT_COPY.LABEL_OVERRIDE_ROUTING}
              </label>
              <select
                id={FIELD_IDS.OVERRIDE_ROUTING}
                value={ovRouting}
                disabled={!inReview}
                onChange={(e) => setOvRouting(e.target.value as RoutingTeam)}
              >
                {ROUTING_TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {ovRouting === 'Other' && (
              <div className="field">
                <label htmlFor={FIELD_IDS.OVERRIDE_ROUTING_OTHER}>
                  {REPORT_COPY.LABEL_OVERRIDE_ROUTING_OTHER}
                  {otherRequired ? ` ${COMMON.REQUIRED_MARK}` : ''}
                </label>
                <input
                  id={FIELD_IDS.OVERRIDE_ROUTING_OTHER}
                  type="text"
                  value={ovOther}
                  disabled={!inReview}
                  onChange={(e) => setOvOther(e.target.value)}
                />
                {errors[FIELD_IDS.OVERRIDE_ROUTING_OTHER] && (
                  <span className="error">
                    {errors[FIELD_IDS.OVERRIDE_ROUTING_OTHER]}
                  </span>
                )}
              </div>
            )}
          </div>

          {reasonRequired && (
            <div className="field" style={{ marginTop: 'var(--s-4)' }}>
              <label htmlFor={FIELD_IDS.OVERRIDE_REASON}>
                {REPORT_COPY.LABEL_OVERRIDE_REASON} {COMMON.REQUIRED_MARK}
              </label>
              <textarea
                id={FIELD_IDS.OVERRIDE_REASON}
                value={ovReason}
                disabled={!inReview}
                onChange={(e) => setOvReason(e.target.value)}
              />
              {errors[FIELD_IDS.OVERRIDE_REASON] && (
                <span className="error">{errors[FIELD_IDS.OVERRIDE_REASON]}</span>
              )}
            </div>
          )}

          {routeBlocked && (
            <label className="row small" style={{ marginTop: 'var(--s-3)' }}>
              <input
                type="checkbox"
                checked={lowConfConfirmed}
                onChange={(e) => setLowConfConfirmed(e.target.checked)}
              />
              {REPORT_COPY.LOW_CONFIDENCE_CONFIRM}
            </label>
          )}

          <div className="row" style={{ marginTop: 'var(--s-4)' }}>
            <button
              type="button"
              id={FIELD_IDS.BTN_ROUTE}
              className="btn btn-primary"
              disabled={!inReview || routeBlocked}
              onClick={onRoute}
            >
              {REPORT_COPY.BTN_ROUTE}
            </button>
            <button
              type="button"
              id={FIELD_IDS.BTN_RESOLVE}
              className="btn"
              disabled={!routed}
              title={!routed ? MESSAGES.RESOLVE_DISABLED_TOOLTIP : undefined}
              onClick={() => setResolveOpen(true)}
            >
              {REPORT_COPY.BTN_RESOLVE}
            </button>
          </div>

          {/* ---- override record (routed / resolved) ---- */}
          {(routed || resolved) && report.was_overridden && (
            <>
              <hr className="section-rule" />
              <h2>{REPORT_COPY.SECTION_OVERRIDE_RECORD}</h2>
              <div className="override-record">
                <div>
                  <p className="small muted">{REPORT_COPY.RECOMMENDED_LABEL}</p>
                  <p>
                    {report.bucket} · {report.severity} · {report.routing_suggestion}
                  </p>
                </div>
                <div>
                  <p className="small muted">{REPORT_COPY.DECIDED_LABEL}</p>
                  <p>
                    {report.bucket_final} · {report.severity_final} ·{' '}
                    {report.routing_final === 'Other'
                      ? report.routing_other_text
                      : report.routing_final}
                  </p>
                </div>
                <div className="full">
                  <p className="small muted">{REPORT_COPY.REASON_LABEL}</p>
                  <p>{report.override_reason}</p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {discarded && (
        <p className="muted">
          {COMMON.NONE_DASH} {REPORT_COPY.DISCARDED_NOTE}
        </p>
      )}

      {confirmDiscard && (
        <Modal
          title={REPORT_COPY.BTN_DISCARD}
          onClose={() => setConfirmDiscard(false)}
          actions={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmDiscard(false)}
              >
                {COMMON.NO}
              </button>
              <button type="button" className="btn btn-primary" onClick={doDiscard}>
                {COMMON.YES}
              </button>
            </>
          }
        >
          <p>{report ? MESSAGES.DISCARD_EXISTING_CONFIRM : MESSAGES.DISCARD_CONFIRM}</p>
        </Modal>
      )}

      {resolveOpen && (
        <Modal
          title={REPORT_COPY.RESOLVE_MODAL_TITLE}
          onClose={() => setResolveOpen(false)}
          actions={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => setResolveOpen(false)}
              >
                {REPORT_COPY.BTN_CANCEL}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!resolutionValid}
                onClick={confirmResolve}
              >
                {REPORT_COPY.BTN_RESOLVE_CONFIRM}
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor={FIELD_IDS.RESOLUTION_NOTE}>
              {REPORT_COPY.LABEL_RESOLUTION_NOTE} {COMMON.REQUIRED_MARK}
            </label>
            <textarea
              id={FIELD_IDS.RESOLUTION_NOTE}
              rows={6}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
            />
            <span className="help">{REPORT_COPY.RESOLVE_MODAL_HELP}</span>
            {!resolutionValid && resolutionNote.length > 0 && (
              <span className="error">{VALIDATION_MESSAGES.RESOLUTION_REQUIRED}</span>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
