import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { NotFound } from './components/not-found';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // One page has routes and the rest of the origin is static assets, so
    // anything that reaches the router unmatched is a wrong URL rather than a
    // missing page. Without this the shell renders around nothing.
    defaultNotFoundComponent: NotFound,
  });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
