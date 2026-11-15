import { MapId } from '../maps/types';

export type AppRoute =
  | { view: 'menu' }
  | { view: 'maps' }
  | { view: 'play'; mapId: MapId }
  | { view: 'custom'; joinCode?: string };

const VALID_MAPS = new Set<MapId>(['urban', 'desert', 'industrial', 'forest']);

export function parseRouteFromLocation(): AppRoute {
  const url = new URL(window.location.href);
  const queryJoin = url.searchParams.get('join')?.trim().toUpperCase();
  if (queryJoin && /^[A-Z0-9]{1,8}$/.test(queryJoin)) {
    return { view: 'custom', joinCode: queryJoin.slice(0, 6) };
  }

  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/' || path === '') {
    return { view: 'menu' };
  }

  if (path === '/maps') {
    return { view: 'maps' };
  }

  if (path === '/custom') {
    return { view: 'custom' };
  }

  if (path.startsWith('/join/')) {
    const code = path.slice('/join/'.length).trim().toUpperCase();
    return { view: 'custom', joinCode: code.slice(0, 6) || undefined };
  }

  if (path.startsWith('/map/')) {
    const candidate = path.slice('/map/'.length) as MapId;
    if (VALID_MAPS.has(candidate)) {
      return { view: 'play', mapId: candidate };
    }
  }

  return { view: 'menu' };
}

export function routeToPath(route: AppRoute): string {
  switch (route.view) {
    case 'menu':
      return '/';
    case 'maps':
      return '/maps';
    case 'play':
      return `/map/${route.mapId}`;
    case 'custom':
      return route.joinCode ? `/join/${route.joinCode}` : '/custom';
  }
}

export function navigateToRoute(route: AppRoute): void {
  const targetPath = routeToPath(route);
  const currentPathWithQuery = `${window.location.pathname}${window.location.search}`;
  if (currentPathWithQuery !== targetPath) {
    window.history.pushState(null, '', targetPath);
  }
}
