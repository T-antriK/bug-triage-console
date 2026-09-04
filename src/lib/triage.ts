// ============================================================
// lib/triage.ts — the submit-time orchestrator the screens call.
// Decides whether to make an LLM call, logs the call or its failure,
// then runs the deterministic pipeline. The pipeline is what actually
// merges the two readings; this file only wires the network in.
// ============================================================

import {
  ACTIVITY_ACTIONS,
  ACTORS,
  FEATURES,
  LLM_CONFIG,
  LLM_FAILURES,
  LLM_NOTICE,
  LLM_PROVIDERS,
} from '../config';
import type { PipelineResult, Settings, TriageInput } from '../types';
import { runPipeline } from '../rules/pipeline';
import { callLlm } from '../llm/client';
import { providerConfig } from '../llm/providers';
import { readSettings } from '../store/storage';
import { log } from '../store/activity';

export type TriageOutcome = {
  result: PipelineResult;
  // A short line to surface to the user when a configured model was not
  // used. null when the model ran, or when no model was configured.
  notice: string | null;
};

export async function runTriage(
  input: TriageInput,
  reportId: string | null,
  settingsOverride?: Settings,
): Promise<TriageOutcome> {
  const settings = settingsOverride ?? readSettings();
  const usingLlm =
    FEATURES.LLM_ENABLED && settings.provider !== 'none' && settings.apiKey.trim().length > 0;

  if (!usingLlm) {
    return { result: runPipeline(input, { llm: null }), notice: null };
  }

  const providerLabel = LLM_PROVIDERS[settings.provider].label;
  const model = settings.model ?? providerConfig(settings.provider).defaultModel ?? null;
  const started = Date.now();
  const outcome = await callLlm(settings, input);
  const elapsed = Date.now() - started;

  let notice: string | null = null;

  if (outcome.ok) {
    log({
      report_id: reportId,
      actor: ACTORS.LLM,
      action: ACTIVITY_ACTIONS.LLM_CALLED,
      detail: `llm ok provider=${settings.provider} model=${model} ms=${elapsed} bucket=${
        outcome.pass.bucket ?? '-'
      }`,
      llm_rationale: outcome.pass.rationale,
    });
  } else if (outcome.failure === LLM_FAILURES.CORS) {
    notice = LLM_NOTICE.CORS_BLOCKED.replace('{provider}', providerLabel);
    log({
      report_id: reportId,
      actor: ACTORS.SYSTEM,
      action: ACTIVITY_ACTIONS.LLM_CORS_BLOCKED,
      detail: `llm.cors_blocked provider=${settings.provider} model=${model} fallback=rules confidence=Low`,
    });
  } else {
    notice = LLM_NOTICE.GENERIC_FALLBACK.replace('{provider}', providerLabel);
    log({
      report_id: reportId,
      actor: ACTORS.SYSTEM,
      action: ACTIVITY_ACTIONS.LLM_FAILED,
      detail: `llm ${outcome.failure} provider=${settings.provider} model=${model} timeout=${LLM_CONFIG.TIMEOUT_MS}ms fallback=rules confidence=Low`,
    });
  }

  return {
    result: runPipeline(input, {
      llm: outcome,
      llm_provider: settings.provider,
      llm_model: model,
    }),
    notice,
  };
}
