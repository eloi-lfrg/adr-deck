import type { Status } from '@adr/format';
import { formatDate, t } from '@/i18n';

/** Colors of each status; labels live in the i18n catalogs (`messages.status`). */
export interface StatusStyle {
  /** Tailwind classes for pills and badges. */
  pill: string;
  /** Tailwind text color class. */
  text: string;
  /** CSS color variable, for inline styles (stamp, bars). */
  color: string;
}

export const STATUS_STYLES: Record<Status, StatusStyle> = {
  'à décider': {
    pill: 'bg-status-pending-bg text-status-pending',
    text: 'text-status-pending',
    color: 'var(--status-pending)',
  },
  validée: {
    pill: 'bg-status-accepted-bg text-status-accepted',
    text: 'text-status-accepted',
    color: 'var(--status-accepted)',
  },
  refusée: {
    pill: 'bg-status-rejected-bg text-status-rejected',
    text: 'text-status-rejected',
    color: 'var(--status-rejected)',
  },
  reportée: {
    pill: 'bg-status-deferred-bg text-status-deferred',
    text: 'text-status-deferred',
    color: 'var(--status-deferred)',
  },
  remplacée: {
    pill: 'bg-status-superseded-bg text-status-superseded',
    text: 'text-status-superseded',
    color: 'var(--status-superseded)',
  },
  obsolète: {
    pill: 'bg-status-deprecated-bg text-status-deprecated',
    text: 'text-status-deprecated',
    color: 'var(--status-deprecated)',
  },
};

export const DECIDED_STATUSES: readonly Status[] = ['validée', 'refusée', 'remplacée', 'obsolète'];

export function isDecided(status: Status): boolean {
  return DECIDED_STATUSES.includes(status);
}

/** « Validée le 5 oct. 2026 », in the current language. */
export function decisionLabel(status: Status, date: string | null): string {
  const messages = t();
  const label = messages.status[status].label;
  return date === null ? label : messages.decidedOn(label, formatDate(date));
}
