import { ApiError } from './errors';

/** This server prerequisite is checked before ticket creation starts. */
export function isTicketReplyRequired(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 409 && cause.message === 'SUPPORT_REPLY_REQUIRED';
}

export const ticketCreationReasons = [
  'SUPPORT_TICKET_CREATE_COOLDOWN', 'SUPPORT_TICKET_CREATE_DAILY_LIMIT',
  'SUPPORT_TICKET_CREATE_ACTIVE_LIMIT', 'SUPPORT_TICKET_CREATE_DUPLICATE',
] as const;
export type TicketCreationReason = typeof ticketCreationReasons[number];
export interface TicketCreationPolicy {
  allowed: boolean;
  reasonCode: TicketCreationReason | null;
  retryAfterSeconds: number;
  retryAt: string | null;
  existingTicketNo: string | null;
  cooldownSeconds: number;
  windowHours: number;
  maxCreatedInWindow: number;
  maxActiveTickets: number;
  createdInWindow: number;
  activeTickets: number;
}

/** BASIC describes the delivered POST capability, not admission for a draft. */
export type TicketCreationCapability = { mode: 'BASIC' } | TicketCreationPolicy;

export function parseTicketCreationCapability(value: unknown): TicketCreationCapability {
  if (value && typeof value === 'object' && 'mode' in value) {
    if (!Array.isArray(value) && value.mode === 'BASIC' && Object.keys(value).length === 1) return { mode: 'BASIC' };
    throw new ApiError({ kind: 'protocol', message: 'SUPPORT_TICKET_POLICY_INVALID' });
  }
  return parseTicketCreationPolicy(value);
}

export function parseTicketCreationPolicy(value: unknown): TicketCreationPolicy {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const counts = ['retryAfterSeconds', 'cooldownSeconds', 'windowHours', 'maxCreatedInWindow', 'maxActiveTickets', 'createdInWindow', 'activeTickets'];
  const positive = ['cooldownSeconds', 'windowHours', 'maxCreatedInWindow', 'maxActiveTickets'];
  if (!v || 'mode' in v || typeof v.allowed !== 'boolean'
    || counts.some(key => typeof v[key] !== 'number' || !Number.isSafeInteger(v[key]) || (v[key] as number) < 0)
    || positive.some(key => (v[key] as number) < 1)
    || (v.allowed ? v.reasonCode !== null : !ticketCreationReasons.includes(v.reasonCode as TicketCreationReason))
    || (v.retryAt !== null && (typeof v.retryAt !== 'string' || !v.retryAt.trim()))
    || (v.existingTicketNo !== null && (typeof v.existingTicketNo !== 'string' || !v.existingTicketNo.trim()))) {
    throw new ApiError({ kind: 'protocol', message: 'SUPPORT_TICKET_POLICY_INVALID' });
  }
  return v as unknown as TicketCreationPolicy;
}

/** Only these explicit application denials are accepted; proxy 429s still fail. */
export const ticketCreationDenials = ticketCreationReasons.flatMap(message => {
  const code = message === 'SUPPORT_TICKET_CREATE_DUPLICATE' ? 409 : 429;
  return [200, code].map(status => ({ status, code, message }));
});

export class TicketCreationDenied extends ApiError {
  readonly policy: TicketCreationPolicy;
  constructor(policy: TicketCreationPolicy) {
    super({ kind: 'business', message: policy.reasonCode ?? 'SUPPORT_TICKET_POLICY_INVALID',
      code: policy.reasonCode === 'SUPPORT_TICKET_CREATE_DUPLICATE' ? 409 : 429 });
    this.policy = policy;
  }
}

export function requireTicketCreationResult(value: unknown): unknown {
  if (value && typeof value === 'object' && 'allowed' in value) {
    const policy = parseTicketCreationPolicy(value);
    if (!policy.allowed) throw new TicketCreationDenied(policy);
    throw new ApiError({ kind: 'protocol', message: 'SUPPORT_TICKET_CREATE_RESPONSE_INVALID' });
  }
  return value;
}
