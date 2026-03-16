import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseColorScheme,
  parseOptionalBooleanQuery,
  parseOptionalColorScheme,
  parseOptionalDarkModeQuery,
  parseOptionalWeekStart,
  parseThemeName,
} from './theme-query.ts';

test('parseThemeName accepts exact configured theme names', () => {
  const theme = parseThemeName('fuchsia', {
    corvus: {
      light: ['#eff2f5', '#A5D6E4', '#52A3C3', '#006699', '#003960'],
      dark: ['#151b23', '#003960', '#006699', '#52A3C3', '#A5D6E4'],
    },
    fuchsia: {
      light: ['#eff2f5', '#fbb4b9', '#f768a1', '#c51b8a', '#7a0177'],
      dark: ['#151b23', '#7a0177', '#c51b8a', '#f768a1', '#fbb4b9'],
    },
  });

  assert.equal(theme, 'fuchsia');
});

test('parseColorScheme falls back to the default for invalid values', () => {
  assert.equal(parseColorScheme('DARK'), 'light');
});

test('parseOptionalColorScheme returns undefined for invalid values', () => {
  assert.equal(parseOptionalColorScheme('DARK'), undefined);
  assert.equal(parseOptionalColorScheme(undefined), undefined);
  assert.equal(parseOptionalColorScheme('dark'), 'dark');
});

test('parseOptionalDarkModeQuery maps auto/true/false to render modes', () => {
  assert.equal(parseOptionalDarkModeQuery('auto'), undefined);
  assert.equal(parseOptionalDarkModeQuery('TRUE'), 'dark');
  assert.equal(parseOptionalDarkModeQuery(' false '), 'light');
  assert.equal(parseOptionalDarkModeQuery('maybe'), undefined);
  assert.equal(parseOptionalDarkModeQuery(undefined), undefined);
});

test('parseOptionalBooleanQuery parses true and false query values', () => {
  assert.equal(parseOptionalBooleanQuery('true'), true);
  assert.equal(parseOptionalBooleanQuery('FALSE'), false);
  assert.equal(parseOptionalBooleanQuery(' maybe '), undefined);
  assert.equal(parseOptionalBooleanQuery(undefined), undefined);
});

test('parseOptionalWeekStart parses valid weekday names', () => {
  assert.equal(parseOptionalWeekStart('sunday'), 'sunday');
  assert.equal(parseOptionalWeekStart(' Monday '), 'monday');
  assert.equal(parseOptionalWeekStart('weekend'), undefined);
  assert.equal(parseOptionalWeekStart(undefined), undefined);
});

test('parseThemeName defaults to corvus when theme query is missing', () => {
  const theme = parseThemeName(undefined, {
    corvus: {
      light: ['#eff2f5', '#A5D6E4', '#52A3C3', '#006699', '#003960'],
      dark: ['#151b23', '#003960', '#006699', '#52A3C3', '#A5D6E4'],
    },
    fuchsia: {
      light: ['#eff2f5', '#fbb4b9', '#f768a1', '#c51b8a', '#7a0177'],
      dark: ['#151b23', '#7a0177', '#c51b8a', '#f768a1', '#fbb4b9'],
    },
  });

  assert.equal(theme, 'corvus');
});

test('parseThemeName uses the provided fallback when theme is missing', () => {
  const theme = parseThemeName(
    undefined,
    {
      corvus: {
        light: ['#eff2f5', '#A5D6E4', '#52A3C3', '#006699', '#003960'],
        dark: ['#151b23', '#003960', '#006699', '#52A3C3', '#A5D6E4'],
      },
      fuchsia: {
        light: ['#eff2f5', '#fbb4b9', '#f768a1', '#c51b8a', '#7a0177'],
        dark: ['#151b23', '#7a0177', '#c51b8a', '#f768a1', '#fbb4b9'],
      },
    },
    'fuchsia',
  );

  assert.equal(theme, 'fuchsia');
});

test('parseThemeName falls back to the default for invalid values', () => {
  const theme = parseThemeName('Fuchsia', {
    corvus: {
      light: ['#eff2f5', '#A5D6E4', '#52A3C3', '#006699', '#003960'],
      dark: ['#151b23', '#003960', '#006699', '#52A3C3', '#A5D6E4'],
    },
    fuchsia: {
      light: ['#eff2f5', '#fbb4b9', '#f768a1', '#c51b8a', '#7a0177'],
      dark: ['#151b23', '#7a0177', '#c51b8a', '#f768a1', '#fbb4b9'],
    },
  });

  assert.equal(theme, 'corvus');
});

test('parseThemeName falls back to a provided default theme', () => {
  const theme = parseThemeName(
    'unknown-theme',
    {
      corvus: {
        light: ['#eff2f5', '#A5D6E4', '#52A3C3', '#006699', '#003960'],
        dark: ['#151b23', '#003960', '#006699', '#52A3C3', '#A5D6E4'],
      },
      fuchsia: {
        light: ['#eff2f5', '#fbb4b9', '#f768a1', '#c51b8a', '#7a0177'],
        dark: ['#151b23', '#7a0177', '#c51b8a', '#f768a1', '#fbb4b9'],
      },
    },
    'fuchsia',
  );

  assert.equal(theme, 'fuchsia');
});
