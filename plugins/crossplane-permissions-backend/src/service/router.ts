import { LoggerService, PermissionsService } from '@backstage/backend-plugin-api';
import express from 'express';
import Router from 'express-promise-router';
import { createPermissionIntegrationRouter } from '@backstage/plugin-permission-node';
import { crossplanePermissions } from '@internal/plugin-crossplane-common-backend';

export interface RouterOptions {
  logger: LoggerService;
  permissions: PermissionsService;
}
export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger } = options;
  logger.info('Initializing Crossplane backend');
  const router = Router();
  router.use(express.json());
  const permissionRouter = createPermissionIntegrationRouter({
    permissions: Object.values(crossplanePermissions),
  });
  router.use(permissionRouter);
  router.get('/health', (_, response) => {
    logger.info('PONG!');
    response.json({ status: 'ok' });
  });
  return router;
}
