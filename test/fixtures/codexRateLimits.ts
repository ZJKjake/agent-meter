/**
 * Sanitized `account/rateLimits/read` response from codex-cli 0.153.4.
 *
 * The account id and reset-credit identifiers are removed. The shape is kept
 * verbatim: the general `codex` limit and the model-specific limit both report
 * a 10080-minute window, which is what made them indistinguishable in the UI.
 */
const GENERAL_LIMIT = {
  limitId: 'codex',
  limitName: null,
  primary: {
    usedPercent: 7,
    windowDurationMins: 10_080,
    resetsAt: 1_789_187_945,
  },
  secondary: null,
  credits: { hasCredits: false, unlimited: false, balance: '0' },
  individualLimit: null,
  spendControlReached: false,
  planType: 'pro',
  rateLimitReachedType: null,
};

const MODEL_LIMIT = {
  limitId: 'codex_bengalfox',
  limitName: 'GPT-5.3-Codex-Spark',
  primary: {
    usedPercent: 0,
    windowDurationMins: 300,
    resetsAt: 1_788_609_522,
  },
  secondary: {
    usedPercent: 0,
    windowDurationMins: 10_080,
    resetsAt: 1_789_196_322,
  },
  credits: null,
  individualLimit: null,
  spendControlReached: null,
  planType: 'pro',
  rateLimitReachedType: null,
};

/**
 * `bucketOrder` controls the key insertion order of `rateLimitsByLimitId`,
 * which is the only thing that changes between the two variants.
 */
export function createCodexRateLimitsResponse(
  bucketOrder: 'general-first' | 'model-first' = 'general-first',
): Record<string, unknown> {
  return {
    rateLimits: GENERAL_LIMIT,
    rateLimitsByLimitId:
      bucketOrder === 'general-first'
        ? { codex: GENERAL_LIMIT, codex_bengalfox: MODEL_LIMIT }
        : { codex_bengalfox: MODEL_LIMIT, codex: GENERAL_LIMIT },
  };
}

export { GENERAL_LIMIT, MODEL_LIMIT };
