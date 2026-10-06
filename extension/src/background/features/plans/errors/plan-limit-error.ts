export type PlanLimitKind = 'feeds' | 'members';

export class PlanLimitError extends Error {
  readonly code = 'PLAN_LIMIT_REACHED';

  constructor(
    readonly limitKind: PlanLimitKind,
    readonly limit: number
  ) {
    super(
      limitKind === 'feeds'
        ? `The Free plan supports up to ${limit} custom feeds.`
        : `The Free plan supports up to ${limit} people per feed.`
    );
    this.name = 'PlanLimitError';
  }
}

export function getPlanLimitErrorResponse(error: PlanLimitError): {
  success: false;
  code: 'PLAN_LIMIT_REACHED';
  limitKind: PlanLimitKind;
  limit: number;
  error: string;
} {
  return {
    success: false,
    code: error.code,
    limitKind: error.limitKind,
    limit: error.limit,
    error: error.message,
  };
}
