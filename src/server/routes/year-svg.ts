import { defineCachedHandler } from 'nitro/cache';
import { getQuery } from 'nitro/h3';
import {
  type CalendarColorScheme,
  type CalendarTheme,
  renderRollingYearsSvg,
} from '../year-svg.ts';

const ONE_HOUR_SECONDS = 60 * 60;

export default defineCachedHandler(
  async (event) => {
    const headerValue = event.req.headers.get('Sec-CH-Prefers-Color-Scheme');

    const colorScheme: CalendarColorScheme =
      headerValue?.trim().toLowerCase() === 'dark' ? 'dark' : 'light';
    const theme: CalendarTheme =
      getQuery(event).theme === 'github' ? 'github' : 'corvus';

    const svg = await renderRollingYearsSvg(1, colorScheme, theme);

    return new Response(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'accept-ch': 'Sec-CH-Prefers-Color-Scheme',
        'critical-ch': 'Sec-CH-Prefers-Color-Scheme',
        vary: 'Sec-CH-Prefers-Color-Scheme',
        'permissions-policy': 'ch-prefers-color-scheme=*',
        'cache-control': `public, max-age=${ONE_HOUR_SECONDS}`,
      },
    });
  },
  {
    maxAge: ONE_HOUR_SECONDS,
    swr: true,
    name: 'year-svg',
  },
);
