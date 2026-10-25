/**
 * Free-trial risk score: combine signals → low auto-approve / medium staff review / high refuse.
 * Pure helpers are unit-tested; thresholds come from settings.
 */

export type TrialRiskInput = {
  phoneVerified: boolean;
  /** Existing hv_dev / device cookie seen */
  hasDeviceId: boolean;
  /** Same device already used for a trial */
  deviceReuse: boolean;
  networkSignal: "ok" | "vpn" | "proxy" | "datacenter" | "unknown";
  disposableEmail: boolean;
  /** Account age in days */
  accountAgeDays: number;
  /** Turnstile failed (when enabled) */
  turnstileFailed: boolean;
  /** Strict mode: first top-up required — caller already enforced; score still notes missing deposit */
  noDeposit: boolean;
  emailVerified: boolean;
};

export type TrialRiskBand = "auto" | "review" | "refuse";

export type TrialRiskResult = {
  score: number;
  band: TrialRiskBand;
  reasons: string[];
};

export type TrialRiskThresholds = {
  /** Score <= this → auto-approve (when auto-approve enabled) */
  autoMax: number;
  /** Score >= this → refuse */
  refuseMin: number;
  /** When false, "auto" becomes "review" (staff still decide) */
  autoApprove: boolean;
};

export const DEFAULT_TRIAL_THRESHOLDS: TrialRiskThresholds = {
  autoMax: 2,
  refuseMin: 8,
  autoApprove: false,
};

/** Disposable / throwaway email domains (short built-in list; extend via settings later). */
const DISPOSABLE = new Set(
  "mailinator.com,guerrillamail.com,tempmail.com,temp-mail.org,10minutemail.com,yopmail.com,trashmail.com,sharklasers.com,getnada.com,discard.email".split(","),
);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return DISPOSABLE.has(domain);
}

/** Pure score. Higher = riskier. */
export function scoreTrialRisk(input: TrialRiskInput, thresholds: TrialRiskThresholds = DEFAULT_TRIAL_THRESHOLDS): TrialRiskResult {
  let score = 0;
  const reasons: string[] = [];
  if (!input.phoneVerified) {
    score += 3;
    reasons.push("+3 phone unverified");
  }
  if (!input.hasDeviceId) {
    score += 2;
    reasons.push("+2 no device id");
  }
  if (input.deviceReuse) {
    score += 5;
    reasons.push("+5 device reuse");
  }
  if (input.networkSignal === "vpn" || input.networkSignal === "proxy") {
    score += 6;
    reasons.push(`+6 ${input.networkSignal}`);
  } else if (input.networkSignal === "datacenter") {
    score += 5;
    reasons.push("+5 datacenter");
  } else if (input.networkSignal === "unknown") {
    score += 1;
    reasons.push("+1 network unknown");
  }
  if (input.disposableEmail) {
    score += 4;
    reasons.push("+4 disposable email");
  }
  if (!input.emailVerified) {
    score += 2;
    reasons.push("+2 email unverified");
  }
  if (input.accountAgeDays < 1) {
    score += 2;
    reasons.push("+2 account <1d");
  } else if (input.accountAgeDays < 3) {
    score += 1;
    reasons.push("+1 account <3d");
  }
  if (input.turnstileFailed) {
    score += 8;
    reasons.push("+8 turnstile failed");
  }
  if (input.noDeposit) {
    score += 1;
    reasons.push("+1 no deposit");
  }

  let band: TrialRiskBand = "review";
  if (score >= thresholds.refuseMin) band = "refuse";
  else if (score <= thresholds.autoMax) band = thresholds.autoApprove ? "auto" : "review";
  else band = "review";

  return { score, band, reasons };
}
