import {
  addUtcDays,
  getUtcDayDifference,
  toIsoDate,
  toUtcDateOnly,
} from './date.ts';
import {
  getWeekdayIndex,
  getWeekdayLabels,
  type WeekStart,
} from './week-start.ts';

export interface PlotActivity {
  date: string;
  count: number;
  level: number;
  weekIndex: number;
  weekdayIndex: number;
  weekdayLabel: string;
  monthTick: boolean;
}

const MIN_VISIBLE_DAYS_FOR_LEADING_MONTH_LABEL = 14;

export function getActivityLevel(count: number): number {
  if (count <= 0) {
    return 0;
  }
  if (count <= 1) {
    return 1;
  }
  if (count <= 3) {
    return 2;
  }
  if (count <= 6) {
    return 3;
  }
  return 4;
}

function isSameUtcMonth(left: Date, right: Date): boolean {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth()
  );
}

function getUtcMonthEnd(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function shouldShowLeadingMonthLabel(start: Date, end: Date): boolean {
  if (start.getUTCDate() === 1 || isSameUtcMonth(start, end)) {
    return true;
  }

  return (
    getUtcDayDifference(start, getUtcMonthEnd(start)) + 1 >=
    MIN_VISIBLE_DAYS_FOR_LEADING_MONTH_LABEL
  );
}

export function buildPlotActivities(
  startDate: Date,
  endDate: Date,
  countsByDate: Map<string, number>,
  weekStart: WeekStart = 'sunday',
): Array<PlotActivity> {
  const normalizedStartDate = toUtcDateOnly(startDate);
  const normalizedEndDate = toUtcDateOnly(endDate);
  const start =
    normalizedStartDate <= normalizedEndDate
      ? normalizedStartDate
      : normalizedEndDate;
  const end =
    normalizedStartDate <= normalizedEndDate
      ? normalizedEndDate
      : normalizedStartDate;
  const weekdayLabels = getWeekdayLabels(weekStart);
  const calendarStart = addUtcDays(start, -getWeekdayIndex(start, weekStart));
  const showLeadingMonthLabel = shouldShowLeadingMonthLabel(start, end);

  const activities: Array<PlotActivity> = [];

  for (
    let currentDate = start;
    currentDate <= end;
    currentDate = addUtcDays(currentDate, 1)
  ) {
    const date = toIsoDate(currentDate);
    const count = countsByDate.get(date) ?? 0;
    const previousActivity = activities[activities.length - 1];
    const weekdayIndex = getWeekdayIndex(currentDate, weekStart);

    activities.push({
      date,
      count,
      level: getActivityLevel(count),
      weekIndex: Math.floor(
        getUtcDayDifference(calendarStart, currentDate) / 7,
      ),
      weekdayIndex,
      weekdayLabel: weekdayLabels[weekdayIndex] ?? '',
      monthTick:
        previousActivity == null
          ? showLeadingMonthLabel
          : previousActivity.date.slice(0, 7) !== date.slice(0, 7),
    });
  }

  return activities;
}
