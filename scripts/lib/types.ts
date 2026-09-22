export type Status = 'up' | 'degraded' | 'down';

/** Why a check failed. Deliberately coarse: nothing from the response is kept. */
export type FailureReason = 'timeout' | 'network' | 'status' | 'content' | 'login';

/** One check as stored in `data/checks/<system>/<day>.json`. */
export interface CheckResult {
  /** ISO time the check finished */
  t: string;
  s: Status;
  /** Response time in milliseconds; for the login check, the sign-in request only */
  ms: number;
  /** HTTP status code, when a response arrived */
  code?: number;
  err?: FailureReason;
}

/** One day's totals in `data/daily/<system>.json`, keyed by Sri Lanka date. */
export interface DailyTotals {
  n: number;
  up: number;
  degraded: number;
  down: number;
  /** Sum of response times of passing checks, for the day's average */
  ms: number;
}

export type DailyFile = Record<string, DailyTotals>;

/** A system's latest state in `data/current.json`. */
export interface SystemState {
  status: Status;
  checkedAt: string;
  ms: number;
  code?: number;
  err?: FailureReason;
  /** Consecutive Down checks */
  failStreak: number;
  /** When the current run of Down checks started */
  downSince?: string;
  /** Developers have been told this system is Down and not yet told it recovered */
  alerted: boolean;
}

export interface CurrentFile {
  updatedAt: string;
  systems: Record<string, SystemState>;
}
