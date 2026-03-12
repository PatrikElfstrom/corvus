import {
  addUtcDays,
  getMondayFirstWeekdayIndex,
  getUtcDayDifference,
  toIsoDate,
  toUtcDateOnly,
} from './date.ts';

export interface PlotActivity {
  date: string;
  count: number;
  level: number;
  weekIndex: number;
  weekdayIndex: number;
  weekdayLabel: string;
  monthTick: boolean;
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

export function buildPlotActivities(
  startDate: Date,
  endDate: Date,
  countsByDate: Map<string, number>,
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
  const calendarStart = addUtcDays(start, -getMondayFirstWeekdayIndex(start));

  const activities: Array<PlotActivity> = [];

  for (
    let currentDate = start;
    currentDate <= end;
    currentDate = addUtcDays(currentDate, 1)
  ) {
    const date = toIsoDate(currentDate);
    const count = countsByDate.get(date) ?? 0;
    const previousActivity = activities[activities.length - 1];
    const weekdayIndex = getMondayFirstWeekdayIndex(currentDate);

    activities.push({
      date,
      count,
      level: getActivityLevel(count),
      weekIndex: Math.floor(
        getUtcDayDifference(calendarStart, currentDate) / 7,
      ),
      weekdayIndex,
      weekdayLabel: WEEKDAY_LABELS[weekdayIndex] ?? '',
      monthTick:
        previousActivity == null ||
        previousActivity.date.slice(0, 7) !== date.slice(0, 7),
    });
  }

  return activities;
}
