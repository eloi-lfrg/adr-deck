export const TIME_ZONE = 'Europe/Paris';

interface ZonedParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  offset: string;
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

function zonedParts(instant: Date): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(instant)) parts[part.type] = part.value;
  const offsetMatch = /GMT([+-]\d{2}:\d{2})?/.exec(parts['timeZoneName'] ?? '');
  return {
    year: parts['year'] ?? '0000',
    month: parts['month'] ?? '01',
    day: parts['day'] ?? '01',
    hour: parts['hour'] ?? '00',
    minute: parts['minute'] ?? '00',
    second: parts['second'] ?? '00',
    offset: offsetMatch?.[1] ?? '+00:00',
  };
}

/** `YYYY-MM-DD` in Europe/Paris. */
export function parisDate(instant: Date): string {
  const p = zonedParts(instant);
  return `${p.year}-${p.month}-${p.day}`;
}

/** `YYYY-MM-DD HH:MM` in Europe/Paris, as used by history lines. */
export function parisDateTime(instant: Date): string {
  const p = zonedParts(instant);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** ISO 8601 timestamp with the Europe/Paris offset, as used by the `updated` header. */
export function parisIsoTimestamp(instant: Date): string {
  const p = zonedParts(instant);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${p.offset}`;
}
