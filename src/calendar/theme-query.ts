import z from 'zod';
import {
  type ColorScheme,
  DEFAULT_COLOR_SCHEME,
  DEFAULT_THEME_NAME,
  getThemeNames,
  type ThemeMap,
  themeSchema,
  themes,
} from '../config/themes.ts';
import { parseOptionalWeekStart } from './week-start.ts';

function getThemeNameSchema(availableThemes: ThemeMap) {
  const themeNames = getThemeNames(availableThemes);

  if (themeNames.length === 0) {
    throw new Error('At least one theme must be available');
  }

  return z
    .enum(themeNames as [string, ...Array<string>])
    .default(DEFAULT_THEME_NAME);
}

export function parseThemeName(
  value: string | undefined,
  availableThemes: ThemeMap = themes,
  fallbackThemeName: string = DEFAULT_THEME_NAME,
): string {
  if (value == null) {
    return fallbackThemeName;
  }

  const result = getThemeNameSchema(availableThemes).safeParse(value);

  return result.success ? result.data : fallbackThemeName;
}

const colorSchemes = Object.keys(themeSchema.shape) as [
  keyof (typeof themeSchema)['shape'],
];

export const colorSchemesSchema = z.enum(colorSchemes).default(colorSchemes[0]);

export function parseColorScheme(value: string | undefined): ColorScheme {
  const result = colorSchemesSchema.safeParse(value);

  return result.success ? result.data : DEFAULT_COLOR_SCHEME;
}

export function parseOptionalColorScheme(
  value: string | undefined,
): ColorScheme | undefined {
  if (value == null) {
    return undefined;
  }

  const result = colorSchemesSchema.safeParse(value);

  return result.success ? result.data : undefined;
}

const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => {
  return value === 'true';
});

const darkModeQuerySchema = z
  .enum(['auto', 'true', 'false'])
  .transform((value): ColorScheme | undefined => {
    if (value === 'auto') {
      return undefined;
    }

    return value === 'true' ? 'dark' : 'light';
  });

export function parseOptionalBooleanQuery(
  value: string | undefined,
): boolean | undefined {
  if (value == null) {
    return undefined;
  }

  const result = booleanQuerySchema.safeParse(value.trim().toLowerCase());

  return result.success ? result.data : undefined;
}

export function parseOptionalDarkModeQuery(
  value: string | undefined,
): ColorScheme | undefined {
  if (value == null) {
    return undefined;
  }

  const result = darkModeQuerySchema.safeParse(value.trim().toLowerCase());

  return result.success ? result.data : undefined;
}

export { parseOptionalWeekStart };
