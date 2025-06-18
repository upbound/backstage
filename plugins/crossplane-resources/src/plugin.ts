import {
  createPlugin,
  createComponentExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const crossplaneResourcesPlugin = createPlugin({
  id: 'crossplane-resources',
  routes: {
    root: rootRouteRef,
  },
});

export const CrossplaneAllResourcesTable = crossplaneResourcesPlugin.provide(
  createComponentExtension({
    name: 'CrossplaneAllResourcesTable',
    component: {
      lazy: () => import('./components/CrossplaneAllResourcesTable').then(m => m.default),
    },
  }),
);

export const CrossplaneResourceGraph = crossplaneResourcesPlugin.provide(
  createComponentExtension({
    name: 'CrossplaneResourceGraph',
    component: {
      lazy: () => import('./components/CrossplaneResourceGraph').then(m => m.default),
    },
  }),
);
export const CrossplaneOverviewCard = crossplaneResourcesPlugin.provide(
  createComponentExtension({
    name: 'CrossplaneOverviewCard',
    component: {
      lazy: () => import('./components/CrossplaneOverviewCard').then(m => m.default),
    },
  }),
);