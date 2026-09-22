import { useCallback, useEffect, useState } from 'react';
import { parseHash, routeToHash, type Route } from '../domain/routing';

export interface RouteApi {
  route: Route;
  navigate: (route: Route) => void;
}

export function useRoute(): RouteApi {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    onHashChange();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = routeToHash(next);
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute(next);
  }, []);

  return { route, navigate };
}
