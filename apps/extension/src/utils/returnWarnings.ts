import { type Order, OrderStatus } from '@/types';

export const RETURN_WARNING_DAY = 25;
export const RETURN_URGENT_DAY = 28;
export const RETURN_TARGET_DAY = 30;
const DAY_MS = 86_400_000;
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export interface ReturnWarning {
  stage: 'warning' | 'urgent' | 'overdue';
  daysSinceOrder: number;
  daysRemaining: number;
  /** Stable calendar-date key for notification deduplication. */
  targetDate: string;
}

/** Parse captured Amazon English dates and ISO dates without UTC shifting the order day. */
function parseOrderDay(value: string): number | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.+)?$/.exec(text);
  const monthFirst = /^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(text);
  const dayFirst = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/i.exec(text);
  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    if (text.includes('T') && !Number.isFinite(Date.parse(text))) {
      return null;
    }
    year = Number(iso[1]);
    month = Number(iso[2]) - 1;
    day = Number(iso[3]);
  } else if (monthFirst || dayFirst) {
    const name = (monthFirst?.[1] ?? dayFirst?.[2] ?? '').toLowerCase();
    month = MONTHS.findIndex(
      (candidate) =>
        name === candidate ||
        name === candidate.slice(0, 3) ||
        (name === 'sept' && candidate === 'september'),
    );
    year = Number(monthFirst?.[3] ?? dayFirst?.[3]);
    day = Number(monthFirst?.[2] ?? dayFirst?.[1]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day));
  // Reject rolled-over dates such as February 30 instead of generating false reminders.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null;
  }
  return date.getTime() / DAY_MS;
}

export function getReturnWarning(order: Order, now = new Date()): ReturnWarning | null {
  if (order.deletedAt || order.status === OrderStatus.Reimbursed) {
    return null;
  }
  const orderDay = parseOrderDay(order.orderDate);
  if (orderDay === null || !Number.isFinite(now.getTime())) {
    return null;
  }

  // Calendar arithmetic keeps the countdown stable across daylight-saving changes.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
  const daysSinceOrder = today - orderDay;
  if (daysSinceOrder < RETURN_WARNING_DAY) {
    return null;
  }

  return {
    stage:
      daysSinceOrder >= RETURN_TARGET_DAY
        ? 'overdue'
        : daysSinceOrder >= RETURN_URGENT_DAY
          ? 'urgent'
          : 'warning',
    daysSinceOrder,
    daysRemaining: RETURN_TARGET_DAY - daysSinceOrder,
    targetDate: new Date((orderDay + RETURN_TARGET_DAY) * DAY_MS).toISOString().slice(0, 10),
  };
}

export function getReturnWarningLabel(warning: ReturnWarning): string {
  if (warning.daysRemaining < 0) {
    return `${warning.daysSinceOrder} days since order · check return options now`;
  }
  if (warning.daysRemaining === 0) {
    return '30-day mark today · review return now';
  }
  return `${warning.daysRemaining} ${warning.daysRemaining === 1 ? 'day' : 'days'} to 30-day mark · consider returning`;
}
