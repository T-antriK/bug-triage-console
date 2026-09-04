// ============================================================
// storage.ts — the only module that touches localStorage.
// Typed read/write helpers, schema-version migration, session
// flag, and settings (provider / model / key).
// ============================================================

import { SCHEMA_VERSION, STORAGE_KEYS } from '../config';
import type { Settings } from '../types';

const SCHEMA_META_KEY = 'triage.schema.v';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private mode). The app keeps working
    // in-memory for this session; nothing else we can do without a backend.
  }
}

export function readCollection<T>(key: string): T[] {
  return read<T[]>(key, []);
}

export function writeCollection<T>(key: string, rows: T[]): void {
  write(key, rows);
}

// ---- schema migration ----
// Runs once on load, before anything reads a collection. Each branch
// transforms rows in place and is idempotent; nothing is wiped or
// reseeded, so a user with reports in flight keeps them.
export function runMigrations(): void {
  let stored = 0;
  try {
    stored = Number(localStorage.getItem(SCHEMA_META_KEY) ?? '0');
  } catch {
    stored = 0;
  }

  if (stored === SCHEMA_VERSION) return;

  // v1 -> v2: TriageReport gained `more_info` and `resolution_note`.
  // Backfill both as null on every existing record. Safe to run when the
  // store is empty (fresh install) and safe to run twice.
  if (stored < 2) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REPORTS);
      if (raw !== null) {
        const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
        let changed = false;
        for (const row of rows) {
          if (!('more_info' in row)) {
            row.more_info = null;
            changed = true;
          }
          if (!('resolution_note' in row)) {
            row.resolution_note = null;
            changed = true;
          }
        }
        if (changed) localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(rows));
      }
    } catch {
      // A corrupt payload is left untouched; the read helpers fall back to [].
    }
  }

  // v2 -> v3: TriageReport gained `rules_matched_patterns` and `llm_spans_dropped`.
  if (stored < 3) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REPORTS);
      if (raw !== null) {
        const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
        let changed = false;
        for (const row of rows) {
          if (!('rules_matched_patterns' in row)) {
            row.rules_matched_patterns = null;
            changed = true;
          }
          if (!('llm_spans_dropped' in row)) {
            row.llm_spans_dropped = null;
            changed = true;
          }
          if (row.schema_version !== SCHEMA_VERSION) {
            row.schema_version = SCHEMA_VERSION;
            changed = true;
          }
        }
        if (changed) localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(rows));
      }
    } catch {
      // A corrupt payload is left untouched; the read helpers fall back to [].
    }
  }

  // v3 -> v4: TriageReport gained `import_source`.
  if (stored < 4) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REPORTS);
      if (raw !== null) {
        const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
        let changed = false;
        for (const row of rows) {
          if (!('import_source' in row)) {
            row.import_source = null;
            changed = true;
          }
          if (row.schema_version !== SCHEMA_VERSION) {
            row.schema_version = SCHEMA_VERSION;
            changed = true;
          }
        }
        if (changed) localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(rows));
      }
    } catch {
      // A corrupt payload is left untouched; the read helpers fall back to [].
    }
  }

  try {
    localStorage.setItem(SCHEMA_META_KEY, String(SCHEMA_VERSION));
  } catch {
    /* ignore */
  }
}

// ---- session flag (has the user passed the start screen) ----
export function hasSession(): boolean {
  return read<boolean>(STORAGE_KEYS.SESSION, false) === true;
}

export function setSession(passed: boolean): void {
  write(STORAGE_KEYS.SESSION, passed);
}

// ---- settings ----
const DEFAULT_SETTINGS: Settings = { provider: 'none', model: null, apiKey: '' };

export function readSettings(): Settings {
  const s = read<Partial<Settings>>(STORAGE_KEYS.SETTINGS, {});
  return {
    provider: s.provider ?? DEFAULT_SETTINGS.provider,
    model: s.model ?? DEFAULT_SETTINGS.model,
    apiKey: s.apiKey ?? DEFAULT_SETTINGS.apiKey,
  };
}

export function writeSettings(next: Settings): void {
  write(STORAGE_KEYS.SETTINGS, next);
}
