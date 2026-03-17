import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampUtcDateRangeToToday,
  getFixedWeekWindow,
  subtractUtcYears,
  toIsoDate,
  toUtcDateOnly,
} from './date.ts';

test('getFixedWeekWindow defaults to a Sunday-first 53-week window', () => {
  const { start, end } = getFixedWeekWindow(53);

  assert.equal(start.getUTCDay(), 0);
  assert.equal(end.getUTCDay(), 6);
  assert.equal((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000), 370);
});

test('getFixedWeekWindow returns a Monday-first 53-week window when requested', () => {
  const { start, end } = getFixedWeekWindow(53, 'monday');

  assert.equal(start.getUTCDay(), 1);
  assert.equal(end.getUTCDay(), 0);
  assert.equal((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000), 370);
});

test('toUtcDateOnly normalizes a value to midnight UTC', () => {
  const date = toUtcDateOnly(new Date('2026-03-12T15:34:56.000Z'));

  assert.equal(toIsoDate(date), '2026-03-12');
  assert.equal(date.toISOString(), '2026-03-12T00:00:00.000Z');
});

test('subtractUtcYears clamps leap-day dates to the target month length', () => {
  const date = subtractUtcYears(new Date('2024-02-29T12:00:00.000Z'), 1);

  assert.equal(date.toISOString(), '2023-02-28T00:00:00.000Z');
});

test('clampUtcDateRangeToToday trims a future end date back to today', () => {
  const range = clampUtcDateRangeToToday(
    new Date('2026-03-09T00:00:00.000Z'),
    new Date('2026-03-22T00:00:00.000Z'),
    new Date('2026-03-17T12:34:56.000Z'),
  );

  assert.deepEqual(
    range && {
      start: toIsoDate(range.start),
      end: toIsoDate(range.end),
    },
    {
      start: '2026-03-09',
      end: '2026-03-17',
    },
  );
});

test('clampUtcDateRangeToToday returns null when the whole range is in the future', () => {
  assert.equal(
    clampUtcDateRangeToToday(
      new Date('2026-03-20T00:00:00.000Z'),
      new Date('2026-03-22T00:00:00.000Z'),
      new Date('2026-03-17T12:34:56.000Z'),
    ),
    null,
  );
});
