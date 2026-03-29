import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlotActivities, getActivityLevel } from './activity.ts';

function makeCountsByDate(
  entries: Array<[date: string, count: number]>,
): Map<string, number> {
  return new Map(entries);
}

test('getActivityLevel preserves the existing contribution buckets', () => {
  assert.equal(getActivityLevel(0), 0);
  assert.equal(getActivityLevel(1), 1);
  assert.equal(getActivityLevel(3), 2);
  assert.equal(getActivityLevel(6), 3);
  assert.equal(getActivityLevel(7), 4);
});

test('buildPlotActivities emits week and weekday coordinates for a Monday-first grid when requested', () => {
  const activities = buildPlotActivities(
    new Date('2026-01-26T00:00:00Z'),
    new Date('2026-02-03T00:00:00Z'),
    makeCountsByDate([
      ['2026-01-27', 1],
      ['2026-02-01', 4],
      ['2026-02-03', 2],
    ]),
    'monday',
  );

  assert.deepEqual(
    activities.map((activity) => ({
      date: activity.date,
      count: activity.count,
      level: activity.level,
      weekIndex: activity.weekIndex,
      weekdayIndex: activity.weekdayIndex,
      weekdayLabel: activity.weekdayLabel,
      monthTick: activity.monthTick,
    })),
    [
      {
        date: '2026-01-26',
        count: 0,
        level: 0,
        weekIndex: 0,
        weekdayIndex: 0,
        weekdayLabel: 'Mon',
        monthTick: false,
      },
      {
        date: '2026-01-27',
        count: 1,
        level: 1,
        weekIndex: 0,
        weekdayIndex: 1,
        weekdayLabel: 'Tue',
        monthTick: false,
      },
      {
        date: '2026-01-28',
        count: 0,
        level: 0,
        weekIndex: 0,
        weekdayIndex: 2,
        weekdayLabel: 'Wed',
        monthTick: false,
      },
      {
        date: '2026-01-29',
        count: 0,
        level: 0,
        weekIndex: 0,
        weekdayIndex: 3,
        weekdayLabel: 'Thu',
        monthTick: false,
      },
      {
        date: '2026-01-30',
        count: 0,
        level: 0,
        weekIndex: 0,
        weekdayIndex: 4,
        weekdayLabel: 'Fri',
        monthTick: false,
      },
      {
        date: '2026-01-31',
        count: 0,
        level: 0,
        weekIndex: 0,
        weekdayIndex: 5,
        weekdayLabel: 'Sat',
        monthTick: false,
      },
      {
        date: '2026-02-01',
        count: 4,
        level: 3,
        weekIndex: 0,
        weekdayIndex: 6,
        weekdayLabel: 'Sun',
        monthTick: true,
      },
      {
        date: '2026-02-02',
        count: 0,
        level: 0,
        weekIndex: 1,
        weekdayIndex: 0,
        weekdayLabel: 'Mon',
        monthTick: false,
      },
      {
        date: '2026-02-03',
        count: 2,
        level: 2,
        weekIndex: 1,
        weekdayIndex: 1,
        weekdayLabel: 'Tue',
        monthTick: false,
      },
    ],
  );
});

test('buildPlotActivities keeps the leading month label when at least two weeks remain in the opening month', () => {
  const activities = buildPlotActivities(
    new Date('2026-01-18T00:00:00Z'),
    new Date('2026-02-03T00:00:00Z'),
    makeCountsByDate([]),
  );

  assert.equal(activities[0]?.date, '2026-01-18');
  assert.equal(activities[0]?.monthTick, true);
  assert.equal(
    activities.find((activity) => activity.date === '2026-02-01')?.monthTick,
    true,
  );
});

test('buildPlotActivities defaults to a Sunday-first grid', () => {
  const activities = buildPlotActivities(
    new Date('2026-01-26T00:00:00Z'),
    new Date('2026-02-03T00:00:00Z'),
    makeCountsByDate([
      ['2026-01-27', 1],
      ['2026-02-01', 4],
      ['2026-02-03', 2],
    ]),
  );

  assert.deepEqual(
    activities.map((activity) => ({
      date: activity.date,
      weekIndex: activity.weekIndex,
      weekdayIndex: activity.weekdayIndex,
      weekdayLabel: activity.weekdayLabel,
    })),
    [
      {
        date: '2026-01-26',
        weekIndex: 0,
        weekdayIndex: 1,
        weekdayLabel: 'Mon',
      },
      {
        date: '2026-01-27',
        weekIndex: 0,
        weekdayIndex: 2,
        weekdayLabel: 'Tue',
      },
      {
        date: '2026-01-28',
        weekIndex: 0,
        weekdayIndex: 3,
        weekdayLabel: 'Wed',
      },
      {
        date: '2026-01-29',
        weekIndex: 0,
        weekdayIndex: 4,
        weekdayLabel: 'Thu',
      },
      {
        date: '2026-01-30',
        weekIndex: 0,
        weekdayIndex: 5,
        weekdayLabel: 'Fri',
      },
      {
        date: '2026-01-31',
        weekIndex: 0,
        weekdayIndex: 6,
        weekdayLabel: 'Sat',
      },
      {
        date: '2026-02-01',
        weekIndex: 1,
        weekdayIndex: 0,
        weekdayLabel: 'Sun',
      },
      {
        date: '2026-02-02',
        weekIndex: 1,
        weekdayIndex: 1,
        weekdayLabel: 'Mon',
      },
      {
        date: '2026-02-03',
        weekIndex: 1,
        weekdayIndex: 2,
        weekdayLabel: 'Tue',
      },
    ],
  );
});
