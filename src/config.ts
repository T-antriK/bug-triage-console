// ============================================================
// src/config.ts
// ALL constants and feature flags for the Bug Triage Console.
// Nothing tunable lives outside this file and src/rules/.
// Sections 3 of BUILD_SPEC.md are reproduced verbatim; a second
// region below holds UI copy and table shapes the screens need,
// kept here so no literal strings leak into components.
// ============================================================

// ============================================================
// FEATURE FLAGS — flip any of these to false and the app still runs
// ============================================================
export const FEATURES = {
  THOR_HAMMER_ENABLED: true, // the hammer scene on the home screen
  ACTIVITY_LOG_ENABLED: true, // false = no writes to the log, nav item hidden
  LLM_ENABLED: true, // false = rules-only, no network calls ever
  SEED_DATA_ENABLED: true, // load the 15 examples as resolved on first run
  DUPLICATE_DETECTION: false, // flag near-identical open reports
  EVAL_HARNESS_ENABLED: true, // "Run all seeds" button in Data Files
} as const;

// ============================================================
// STORAGE
// ============================================================
// v2 (Iteration 2): TriageReport gained `more_info` and `resolution_note`.
// v3 (Iteration 3): TriageReport gained `rules_matched_patterns` and
// `llm_spans_dropped`. EvidenceSpan gained optional `provenance`.
// v4 (Iteration 4): TriageReport gained `import_source`.
export const SCHEMA_VERSION = 4;

export const STORAGE_KEYS = {
  REPORTS: 'triage.reports.v1',
  ACTIVITY: 'triage.activity.v1',
  FEEDBACK: 'triage.feedback.v1',
  SETTINGS: 'triage.settings.v1',
  SESSION: 'triage.session.v1', // has the user passed the start screen
} as const;

// ============================================================
// LLM
// ============================================================
// Four working providers plus rules-only. `shape` drives which request
// builder and response parser client.ts uses: 'anthropic' | 'openai' |
// 'gemini' | 'none'. Kimi is OpenAI-compatible, so it reuses that pair.
// `keyHeader` names the header the key goes in; for 'Authorization' the
// value is `Bearer ${key}`. The model field in the UI is editable free
// text — `modelSuggestions` only pre-fills a datalist — because provider
// model IDs change often and a teammate must be able to type a new one.
export const LLM_PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    shape: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    modelSuggestions: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
    keyPlaceholder: 'sk-ant-...',
    keyHeader: 'x-api-key',
    supportsTemperature: true,
    extraHeaders: {
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  },
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    shape: 'openai',
    defaultModel: 'gpt-4o',
    modelSuggestions: ['gpt-4o', 'gpt-4o-mini'],
    keyPlaceholder: 'sk-...',
    keyHeader: 'Authorization', // value is `Bearer ${key}`
    supportsTemperature: true,
    extraHeaders: {},
  },
  gemini: {
    label: 'Google (Gemini)',
    endpoint:
      'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    shape: 'gemini',
    defaultModel: 'gemini-2.5-flash',
    modelSuggestions: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    keyPlaceholder: 'AIza...',
    keyHeader: 'x-goog-api-key',
    supportsTemperature: true,
    extraHeaders: {},
  },
  kimi: {
    label: 'Moonshot (Kimi)',
    // Global platform. China platform is api.moonshot.cn; keys are NOT
    // interchangeable. Verified reachable direct from browser (returns 401
    // on bad auth rather than a CORS block), so no proxy needed.
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    proxyPath: '/api/kimi/v1/chat/completions',
    requiresProxy: false,
    modelsEndpoint: 'https://api.moonshot.ai/v1/models',
    shape: 'openai',
    defaultModel: 'kimi-k2.6',
    // Verified live from GET /v1/models. kimi-k3 has mandatory reasoning
    // at max effort by default — too slow for classification.
    modelSuggestions: ['kimi-k2.6', 'kimi-k3', 'kimi-k2.7-code'],
    keyPlaceholder: 'sk-...',
    keyHeader: 'Authorization', // authHeaders in providers.ts sends `Bearer ${key.trim()}`
    // kimi-k2.6 is a reasoning model: rejects temperature != 1 with 400.
    // Omitting the field lets the server use its default.
    supportsTemperature: false,
    // Reasoning tokens count against max_tokens. 1500 is exhausted before
    // content is written; 8000 gives enough headroom for reasoning + output.
    maxTokens: 8000,
    // Reasoning models take longer than the global 20 s default.
    timeoutMs: 60000,
    extraHeaders: {},
  },
  none: {
    label: 'Rules only — no API key needed',
    endpoint: null,
    shape: 'none',
    defaultModel: null,
    modelSuggestions: [],
    keyPlaceholder: '',
    keyHeader: null,
    supportsTemperature: false,
    extraHeaders: {},
  },
} as const;

export const LLM_CONFIG = {
  TIMEOUT_MS: 20000, // after this, fall back to rules-only for that report
  MAX_TOKENS: 1500,
  TEMPERATURE: 0, // classification wants determinism, not creativity
  MAX_RETRIES: 1,
} as const;

// ============================================================
// FORM FIELD IDS — referenced by the DOM and by the activity log
// ============================================================
export const FIELD_IDS = {
  BUG_REPORT: 'input-bug-report',
  CUSTOMER: 'input-customer',
  CALL_ID: 'input-call-id',
  STARTED_AT: 'input-started-at',
  IMPACT: 'input-impact',
  OVERRIDE_BUCKET: 'override-bucket',
  OVERRIDE_SEVERITY: 'override-severity',
  OVERRIDE_ROUTING: 'override-routing',
  OVERRIDE_ROUTING_OTHER: 'override-routing-other',
  OVERRIDE_REASON: 'override-reason',
  MORE_INFO: 'input-more-info',
  RESOLUTION_NOTE: 'input-resolution-note',
  BTN_DISCARD: 'btn-discard',
  BTN_SAVE: 'btn-save',
  BTN_SUBMIT: 'btn-submit',
  BTN_ROUTE: 'btn-route',
  BTN_RESOLVE: 'btn-resolve',
} as const;

// Segmented impact control — the group carries FIELD_IDS.IMPACT, each
// button carries one of these.
export const IMPACT_BUTTON_IDS = {
  single: 'input-impact-single',
  many: 'input-impact-many',
  outage: 'input-impact-outage',
} as const;

// ============================================================
// DOMAIN VOCABULARY
// ============================================================
export const IMPACT_OPTIONS = ['single', 'many', 'outage'] as const;
export const IMPACT_LABELS = {
  single: 'Single caller',
  many: 'Many callers',
  outage: 'Outage',
} as const;

export const BUCKET_IDS = ['STT', 'TTS', 'LLM', 'POST_CALL', 'INFRA'] as const;
export const BUCKET_LABELS = {
  STT: 'Speech-to-text',
  TTS: 'Text-to-speech',
  LLM: 'LLM / agent reasoning',
  POST_CALL: 'Post-call process',
  INFRA: 'Infrastructure',
} as const;

export const SEVERITY_LEVELS = ['Sev0', 'Sev1', 'Sev2', 'Sev3'] as const;
export const SEVERITY_LABELS = {
  Sev0: 'Sev0 — Stop-ship / outage',
  Sev1: 'Sev1 — Major',
  Sev2: 'Sev2 — Moderate',
  Sev3: 'Sev3 — Minor',
} as const;

export const ROUTING_TEAMS = ['Voice AI', 'Platform/Infra', 'Integrations', 'Other'] as const;

export const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low'] as const;

export const REPORT_STATUSES = [
  'draft',
  'in_review',
  'routed',
  'resolved',
  'discarded',
] as const;

export const STATUS_LABELS = {
  draft: 'Draft',
  in_review: 'In review',
  routed: 'Routed',
  resolved: 'Resolved',
  discarded: 'Discarded',
} as const;

// ============================================================
// VALIDATION
// ============================================================
export const VALIDATION = {
  BUG_REPORT_MIN_CHARS: 10,
  BUG_REPORT_MAX_CHARS: 4000,
  CUSTOMER_MAX_CHARS: 120,
  REASON_MIN_CHARS: 5, // override reason must say something
  RESOLUTION_MIN_CHARS: 10, // resolution note must actually explain the fix
  MORE_INFO_MAX_CHARS: 4000,
  MAX_QUESTIONS_SHOWN: 5,
} as const;

// How much of a value_from / value_to the activity log keeps before it
// appends the truncation marker. Deliberately high: override reasons and
// resolution notes are exactly the text a reader needs in full.
export const ACTIVITY_VALUE_MAX_CHARS = 1000;
export const ACTIVITY_TRUNCATED_MARK = '…[truncated]';

// ============================================================
// FEEDBACK
// ============================================================
export const FEEDBACK_EMAIL = 'prateek.thawani@gmail.com';
export const FEEDBACK_PLACEHOLDER = 'Provide feedback...';

// ============================================================
// THOR HAMMER
// ============================================================
export const THOR = {
  MIN_ATTEMPTS: 2, // inclusive
  MAX_ATTEMPTS: 3, // inclusive; actual target picked at random per cycle
  TOOLTIP: 'Can you pick it up? Click to test your worthiness!',
  FAILURE_MESSAGE: 'Manifest more worthiness and try again!',
  FAILURE_BUTTON: 'OK',
  DROP_BUTTON_LABEL: 'Drop',
  LIFT_DURATION_MS: 900,
  LIFT_OFFSET_PX: 96, // how far the head clears the grass when worthy
  PALETTE: {
    HANDLE: '#6b4a2b',
    HEAD: '#9aa3ad',
    HEAD_EDGE: '#5b636d',
    HEAD_TOP: '#7c848d',
    SHADOW: 'rgba(0,0,0,0.18)',
  },
} as const;

// ============================================================
// UI
// ============================================================
export const UI = {
  START_BLINK_PERIOD_MS: 1400, // slow, deliberate blink
  TOAST_DURATION_MS: 3000,
  QUEUE_PAGE_SIZE: 50,
  MORE_INFO_DEBOUNCE_MS: 600, // debounce before persisting the More info textarea
} as const;

// ============================================================
// ============================================================
// ADDITIONAL CONSTANTS FOR THIS IMPLEMENTATION
// Everything below keeps literal UI strings, route paths, table
// column shapes and scoring knobs out of the components so the
// acceptance rule "no hardcoded string or number outside config
// and rules" holds. Rearrange copy here; the screens only read it.
// ============================================================
// ============================================================

// ---- Routes ----
export const ROUTES = {
  START: '/',
  HOME: '/home',
  REPORT_NEW: '/report/new',
  REPORT: '/report', // + /:id
  BULK: '/bulk',
  QUEUE: '/queue',
  ACTIVITY: '/activity',
  GUIDE: '/guide',
  FEEDBACK: '/feedback',
  DATA: '/data',
  DATA_TABLE: '/data/table', // + /:name
} as const;

// ---- ID prefixes / padding ----
export const IDS = {
  REPORT_PREFIX: 'RPT-',
  REPORT_PAD: 4,
  ACTIVITY_PREFIX: 'LOG-',
  ACTIVITY_PAD: 6,
  FEEDBACK_PREFIX: 'FB-',
  FEEDBACK_PAD: 4,
} as const;

// ---- Activity actions (the append-only vocabulary) ----
export const ACTIVITY_ACTIONS = {
  REPORT_CREATED: 'report.created',
  DRAFT_SAVED: 'report.draft_saved',
  SUBMITTED: 'report.submitted',
  BUCKET_COMPUTED: 'classify.bucket',
  SEVERITY_COMPUTED: 'classify.severity',
  CONFIDENCE_COMPUTED: 'classify.confidence',
  ROUTING_COMPUTED: 'classify.routing',
  LLM_CALLED: 'llm.called',
  LLM_FAILED: 'llm.failed',
  LLM_CORS_BLOCKED: 'llm.cors_blocked',
  OVERRIDE: 'report.override',
  MORE_INFO_UPDATED: 'report.more_info',
  ROUTED: 'report.routed',
  RESOLVED: 'report.resolved',
  DISCARDED: 'report.discarded',
  FEEDBACK_SUBMITTED: 'feedback.submitted',
  SEED_LOADED: 'seed.loaded',
  BULK_IMPORTED: 'bulk.imported',
} as const;

export const ACTORS = {
  SYSTEM: 'system',
  USER: 'user',
  LLM: 'llm',
} as const;

// ---- Toasts and short messages ----
export const MESSAGES = {
  DRAFT_SAVED: 'Draft saved.',
  TRIAGE_DONE: 'Triage complete.',
  FEEDBACK_SAVED: 'Feedback saved.',
  REPORT_ROUTED_PREFIX: 'Routed to ',
  REPORT_RESOLVED: 'Marked resolved.',
  REPORT_DISCARDED: 'Report discarded.',
  RESOLVE_DISABLED_TOOLTIP: 'Route to a team first.',
  DISCARD_CONFIRM: 'Discard this report? Nothing will be saved.',
  DISCARD_EXISTING_CONFIRM: 'Discard this report? It stays in the data files but leaves the queue.',
  LLM_RATIONALE_MAX: 140,
  BULK_IMPORTED_PREFIX: ' reports imported and triaged.',
  BULK_TEMPLATE_FILENAME: 'bug-triage-template.csv',
  BULK_MAX_ROWS: 200,
  BULK_LLM_DELAY_MS: 500,
} as const;

// ---- Validation copy ----
export const VALIDATION_MESSAGES = {
  BUG_REPORT_TOO_SHORT: 'The bug report needs at least 10 characters. Describe what went wrong.',
  BUG_REPORT_TOO_LONG: 'The bug report is over 4000 characters. Trim it to the essentials.',
  CUSTOMER_TOO_LONG: 'Customer name is over 120 characters.',
  IMPACT_REQUIRED: 'Choose an impact level.',
  REASON_REQUIRED: 'You changed a recommendation. Say why in at least 5 characters.',
  ROUTING_OTHER_REQUIRED: 'You picked "Other". Name the team.',
  RESOLUTION_REQUIRED: 'Write at least 10 characters describing the cause and the fix.',
} as const;

// ---- LLM notice copy shown on the report after a fallback ----
export const LLM_NOTICE = {
  // {provider} is replaced with the provider label
  CORS_BLOCKED:
    '{provider} blocked a direct browser request. This provider may require a server proxy. Rules-only triage was used for this report.',
  GENERIC_FALLBACK:
    'The configured model ({provider}) did not return a usable answer, so rules-only triage was used for this report.',
} as const;

// ---- LLM failure labels (used in activity detail + confidence) ----
export const LLM_FAILURES = {
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  CORS: 'cors', // browser blocked a direct cross-origin request to the provider
  AUTH: 'auth',
  RATE_LIMIT: 'rate_limit',
  BAD_JSON: 'bad_json',
  BAD_SHAPE: 'bad_shape',
  DISABLED: 'disabled',
  NO_KEY: 'no_key',
} as const;

// ---- Classifier scoring knobs referenced by confidence.ts / UI ----
// (bucket scoring itself lives in src/rules/buckets.ts)
export const CLASSIFIER = {
  RULES_TOP_SCORE_LOW_THRESHOLD: 4, // top score under this, rules-only => Low confidence
  DUPLICATE_SIMILARITY_THRESHOLD: 0.6,
} as const;

// ---- Data Files table registry ----
export const DATA_TABLES = {
  reports: { name: 'reports', label: 'Reports' },
  activity: { name: 'activity', label: 'Activity log' },
  feedback: { name: 'feedback', label: 'Feedback' },
} as const;

export const DATA_FILES_COPY = {
  TITLE: 'Data files',
  INTRO:
    'Everything the console has stored, as plain tables. Each opens in a new tab. Copy as TSV for a spreadsheet, Download CSV for a file.',
  COPY_TSV: 'Copy as TSV',
  DOWNLOAD_CSV: 'Download CSV',
  COPIED: 'Copied to clipboard.',
  UNKNOWN_TABLE: 'Unknown table: ',
  RUN_SEEDS: 'Run all seeds',
  RUN_SEEDS_HINT:
    'Re-runs the pipeline over the 15 built-in examples and checks each against the answer key.',
  EVAL_PASS: 'pass',
  EVAL_FAIL: 'fail',
  EVAL_SUMMARY_PREFIX: 'Result: ',
  EVAL_COL_NUM: '#',
  EVAL_COL_REPORT: 'Report',
  EVAL_COL_EXP_BUCKET: 'Expected bucket',
  EVAL_COL_ACT_BUCKET: 'Actual bucket',
  EVAL_COL_EXP_SEV: 'Expected sev',
  EVAL_COL_ACT_SEV: 'Actual sev',
  EVAL_COL_RESULT: 'Result',
  EVAL_PASS_SUFFIX: ' pass',
} as const;

// ---- Reports table column order (input -> computed -> override -> lifecycle) ----
export const REPORT_TABLE_COLUMNS = [
  'id',
  'schema_version',
  'created_at',
  'updated_at',
  'bug_report',
  'customer',
  'call_id',
  'started_at',
  'impact',
  'bucket',
  'secondary_tags',
  'severity',
  'confidence',
  'routing_suggestion',
  'reason_chain',
  'next_questions',
  'more_info',
  'escalations',
  'impact_escalated_from',
  'classifier_mode',
  'llm_provider',
  'llm_model',
  'llm_agreed',
  'rules_bucket',
  'llm_bucket',
  'bucket_final',
  'severity_final',
  'routing_final',
  'routing_other_text',
  'override_reason',
  'overridden_at',
  'was_overridden',
  'status',
  'submitted_at',
  'routed_at',
  'resolved_at',
  'resolution_note',
  'import_source',
] as const;

export const ACTIVITY_TABLE_COLUMNS = [
  'id',
  'timestamp',
  'report_id',
  'actor',
  'action',
  'field',
  'value_from',
  'value_to',
  'detail',
  'llm_rationale',
  'rules_matched_patterns',
  'llm_spans_dropped',
] as const;

export const FEEDBACK_TABLE_COLUMNS = ['id', 'timestamp', 'to', 'body'] as const;

// ---- Queue screen ----
export const QUEUE_COPY = {
  TITLE: 'Triage queue',
  BACK: 'Back to queue',
  EMPTY: 'No reports yet. Start with a new bug report.',
  EMPTY_LINK: 'New bug report',
  TRUNCATE_REPORT_CHARS: 60,
  FILTER_BUCKET: 'Bucket',
  FILTER_SEVERITY: 'Severity',
  FILTER_CUSTOMER: 'Customer',
  FILTER_STATUS: 'Status',
  FILTER_ROUTING: 'Routing team',
  FILTER_ALL: 'All',
  CLEAR_ALL: 'Clear all',
  COL_ID: 'ID',
  COL_CREATED: 'Created',
  COL_CUSTOMER: 'Customer',
  COL_REPORT: 'Report',
  COL_BUCKET: 'Bucket',
  COL_SEVERITY: 'Severity',
  COL_CONFIDENCE: 'Confidence',
  COL_ROUTING: 'Routing',
  COL_STATUS: 'Status',
  COL_OVERRIDDEN: 'Overridden',
  YES: 'Yes',
  NO: 'No',
  SORT_ASC: ' ▲',
  SORT_DESC: ' ▼',
} as const;

// ---- Activity log screen ----
export const ACTIVITY_COPY = {
  TITLE: 'Activity log',
  EMPTY: 'Nothing logged yet. Actions show up here as you work.',
  FILTER_REPORT: 'Report ID',
  FILTER_ACTOR: 'Actor',
  FILTER_ALL: 'All',
  COL_TIMESTAMP: 'Timestamp',
  COL_REPORT: 'Report',
  COL_ACTOR: 'Actor',
  COL_ACTION: 'Action',
  COL_FIELD: 'Field',
  COL_FROM: 'From',
  COL_TO: 'To',
  COL_DETAIL: 'Detail',
  COL_RATIONALE: 'LLM rationale',
} as const;

// ---- Start screen ----
export const START_COPY = {
  PROVIDER_LABEL: 'Provider',
  MODEL_LABEL: 'Model',
  MODEL_HELP: 'Type any model ID this provider supports. Suggestions are just a starting point.',
  KEY_LABEL: 'API key',
  CLICK_TO_START: 'Click to start!',
  HINT: 'Pick a provider. Rules only needs no key.',
  RULES_ONLY_EXPLAINER:
    'Rules only runs the full triage engine locally using keyword rules. No API key, no network calls, nothing leaves this browser. You still get a bucket, severity, evidence, routing and prompts exactly as you would with a model. Confidence sits lower because there is no second method to cross-check against.',
  DIFFERENCE_TOGGLE: "What's the difference?",
  DIFFERENCE_RULES:
    'Rules only — keyword patterns and the severity rubric, running in your browser. Deterministic, instant, free, works offline.',
  DIFFERENCE_MODEL:
    'With a model — the same rules run, plus a model reads the report and returns its own bucket and signals. The two are compared. Agreement raises confidence; disagreement flags the report for a human. Better on messy phrasing that the keyword tables do not anticipate.',
} as const;

// ---- Home screen ----
export const HOME_COPY = {
  TITLE: 'Bug Triage Console',
  SUBTITLE: 'Messy report in. A recommended bucket, severity, routing, and prompts for more info out. A human confirms before anything routes.',
  NAV_NEW: 'New bug report',
  NAV_BULK: 'Bulk upload',
  NAV_QUEUE: 'Triage queue',
  NAV_GUIDE: 'User guide',
  NAV_ACTIVITY: 'Activity log',
  NAV_DATA: 'Data files',
  FOOTER_CHANGE_KEY: 'Change model or key',
  FOOTER_FEEDBACK: 'Need help or Submit feedback to improve!',
} as const;

// ---- Report form ----
export const REPORT_COPY = {
  TITLE_NEW: 'New bug report',
  TITLE_EXISTING: 'Report ',
  LABEL_BUG_REPORT: 'Bug report',
  LABEL_CUSTOMER: 'Customer',
  LABEL_CALL_ID: 'Call ID',
  LABEL_STARTED_AT: 'Started at',
  LABEL_IMPACT: 'Impact',
  HELP_BUG_REPORT: 'Paste the report as it came in. Do not clean it up.',
  HELP_CALL_ID: 'Optional. One ID is enough to start.',
  HELP_STARTED_AT: 'Optional. When the caller first saw it.',
  BTN_DISCARD: 'Discard',
  BTN_SAVE: 'Save draft',
  BTN_SUBMIT: 'Run triage',
  BTN_ROUTE: 'Route to team',
  BTN_RESOLVE: 'Mark resolved',
  BTN_RESOLVE_CONFIRM: 'Mark as resolved',
  BTN_CANCEL: 'Cancel',
  SECTION_RESULTS: 'Triage results',
  SECTION_BUCKET: 'Bucket',
  SECTION_SECONDARY_TAGS: 'Secondary tags',
  SECONDARY_TAGS_EMPTY_TIP: 'No secondary tags matched.',
  SECTION_SEVERITY: 'Severity',
  SECTION_CONFIDENCE: 'Confidence',
  SECTION_EVIDENCE: 'Evidence',
  SECTION_REASON_CHAIN: 'How severity was derived',
  SECTION_ROUTING: 'Routing suggestion',
  SECTION_ESCALATIONS: 'Escalation actions',
  SECTION_QUESTIONS: 'Prompts for more info',
  SECTION_MORE_INFO: 'More info',
  SECTION_RESOLUTION: 'Resolution',
  SECTION_OVERRIDE: 'Confirm or override',
  SECTION_OVERRIDE_RECORD: 'System recommended vs. human decision',
  LABEL_MORE_INFO: 'More info',
  HELP_MORE_INFO:
    'Answer any of the prompts above, or add anything else that comes to mind. This goes to the team you route to.',
  PLACEHOLDER_MORE_INFO: 'Add anything the prompts above surfaced...',
  RESOLVE_MODAL_TITLE: 'Document the resolution',
  RESOLVE_MODAL_HELP:
    'What was the actual cause, and what fixed it? This is what the next person reads when a similar report comes in.',
  LABEL_RESOLUTION_NOTE: 'Resolution note',
  LLM_FALLBACK_NOTE_PREFIX: 'A model (',
  LLM_FALLBACK_NOTE_SUFFIX:
    ') was configured but did not contribute. This report was triaged rules-only.',
  LABEL_OVERRIDE_BUCKET: 'Bucket',
  LABEL_OVERRIDE_SEVERITY: 'Severity',
  LABEL_OVERRIDE_ROUTING: 'Route to',
  LABEL_OVERRIDE_ROUTING_OTHER: 'Which team?',
  LABEL_OVERRIDE_REASON: 'Reason for the change',
  RECOMMENDED_LABEL: 'System recommended',
  DECIDED_LABEL: 'Human decided',
  REASON_LABEL: 'Reason',
  COPY_QUESTIONS: 'Copy prompts',
  QUESTIONS_COPIED: 'Prompts copied.',
  WHAT_TO_CHECK: 'What to check: ',
  LOW_CONFIDENCE_NOTE:
    'Confidence is Low. Both candidate buckets are shown. Confirm or override before routing.',
  LOW_CONFIDENCE_CONFIRM: 'Confirm this recommendation as-is',
  IMPACT_ESCALATED_PREFIX: 'Escalated from ',
  IMPACT_ESCALATED_SUFFIX: '. The report describes a service-level failure.',
  NARROWER_FLAG:
    'The text reads narrower than the selected impact. Left as-is for a human to check, not downgraded.',
  DISAGREEMENT_PREFIX: 'Rules and the model disagreed: rules matched ',
  DISAGREEMENT_MID: ', the model returned ',
  DISAGREEMENT_REASON: '. The model’s answer was used, because rules match keywords while the model reads the surrounding language. Rules matched on: ',
  DISAGREEMENT_SUFFIX: '. Confidence lowered to Low — confirm or override before routing.',
  DUPLICATE_PREFIX: 'This looks similar to ',
  DUPLICATE_SUFFIX: ' (in review).',
  DISCARDED_NOTE: 'This report was discarded and is read-only.',
} as const;

// ---- Feedback screen ----
export const FEEDBACK_COPY = {
  TITLE: 'Send feedback',
  TO_LABEL: 'To',
  BODY_LABEL: 'Your feedback',
  SUBMIT: 'Save feedback',
  OPEN_EMAIL: 'Open in email client',
  MAILTO_SUBJECT: 'Bug Triage Console feedback',
  EMPTY: 'Write something first.',
} as const;

// ---- User guide (screenshot placeholders resolve from public/guide/) ----
export const GUIDE_IMAGE_BASE = '/guide/';

// ---- CSV / TSV export ----
export const EXPORT = {
  CSV_DELIMITER: ',',
  TSV_DELIMITER: '\t',
  ROW_SEPARATOR: '\r\n',
  QUOTE: '"',
  CSV_MIME: 'text/csv;charset=utf-8',
  FILENAME_PREFIX: 'triage-',
  FILENAME_SUFFIX: '.csv',
} as const;

// ---- date display ----
export const DATE_FORMAT = {
  LOCALE: 'en-US',
  OPTIONS: {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  },
} as const;

// ---- generic UI words used in more than one screen ----
export const COMMON = {
  YES: 'Yes',
  NO: 'No',
  NONE_DASH: '—',
  BACK_HOME: 'Home',
  NEW_TAB_HINT: '(opens in a new tab)',
  REQUIRED_MARK: '*',
} as const;
