import { getWeekdayIndex, type WeekStart } from './week-start.ts';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toUtcDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function getUtcDayDifference(startDate: Date, endDate: Date): number {
  return Math.round(
    (toUtcDateOnly(endDate).getTime() - toUtcDateOnly(startDate).getTime()) /
      DAY_IN_MS,
  );
}

export function subtractUtcYears(value: Date, years: number): Date {
  const source = toUtcDateOnly(value);
  const targetYear = source.getUTCFullYear() - years;
  const targetMonth = source.getUTCMonth();
  const day = source.getUTCDate();
  const maxDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, maxDay);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

export function getFixedWeekWindow(
  totalWeeks: number,
  weekStart: WeekStart = 'sunday',
): {
  start: Date;
  end: Date;
} {
  const weeks = Math.max(1, totalWeeks);
  const totalDays = weeks * 7;

  const todayUtc = toUtcDateOnly(new Date());
  const daysSinceWeekStart = getWeekdayIndex(todayUtc, weekStart);

  const currentWeekStart = new Date(todayUtc);
  currentWeekStart.setUTCDate(todayUtc.getUTCDate() - daysSinceWeekStart);

  const end = new Date(currentWeekStart);
  end.setUTCDate(currentWeekStart.getUTCDate() + 6);

  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (totalDays - 1));

  return { start, end };
}
