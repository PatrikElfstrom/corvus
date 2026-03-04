import { defineCachedHandler } from 'nitro/cache';
import { renderRollingYearsSvg } from '../year-svg.ts';

const ONE_HOUR_SECONDS = 60 * 60;

export default defineCachedHandler(
  (event) => {
    event.res.headers.set('content-type', 'image/svg+xml; charset=utf-8');
    event.res.headers.set(
      'cache-control',
      `public, max-age=${ONE_HOUR_SECONDS}`,
    );

    return renderRollingYearsSvg(1);
  },
  {
    maxAge: ONE_HOUR_SECONDS,
    swr: true,
    name: 'year-svg',
  },
);
