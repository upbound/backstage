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

export const CrossplaneCompositeResourcesTable = crossplaneResourcesPlugin.provide(
  createComponentExtension({
    name: 'CrossplaneCompositeResourcesTable',
    component: {
      lazy: () => import('./components/CrossplaneCompositeResourcesTable').then(m => m.default),
    },
  }),
);

export const CrossplaneManagedResources = crossplaneResourcesPlugin.provide(
  createComponentExtension({
    name: 'CrossplaneManagedResources',
    component: {
      lazy: () => import('./components/CrossplaneManagedResources').then(m => m.default),
    },
  }),
);

export const CrossplaneClaimResourcesTable = crossplaneResourcesPlugin.provide(
  createComponentExtension({
    name: 'CrossplaneClaimResourcesTable',
    component: {
      lazy: () => import('./components/CrossplaneClaimResourcesTable').then(m => m.default),
    },
  }),
);

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