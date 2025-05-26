import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { kubernetesAuthStrategyExtensionPoint } from '@backstage/plugin-kubernetes-node';
import { UpboundStrategy } from './UpboundStrategy';

export const kubernetesModuleUpbound = createBackendModule({
  pluginId: 'kubernetes',
  moduleId: 'upbound',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        authStrategy: kubernetesAuthStrategyExtensionPoint,
      },
      async init({ logger, config, authStrategy }) {
        try {
          const upboundConfig = config.getOptionalConfig('kubernetes.upbound');
          const authHost = upboundConfig?.getOptionalString('authHost') || 'auth.upbound.io';

          const strategy = new UpboundStrategy(logger, { authHost });

          authStrategy.addAuthStrategy('upbound', strategy);

          const authProviders = (global as any).__kubernetesAuthProviders || new Map();
          authProviders.set('upbound', strategy);
          (global as any).__kubernetesAuthProviders = authProviders;

          if (!(global as any).kubernetesAuthStrategies) {
            (global as any).kubernetesAuthStrategies = new Map();
          }
          (global as any).kubernetesAuthStrategies.set('upbound', strategy);

          logger.info('Registered Upbound authentication strategy for Kubernetes');

        } catch (error) {
          const errorObj = error instanceof Error ? error : new Error(String(error));
          logger.error('Failed to register Upbound auth strategy', errorObj);
          throw errorObj;
        }
      },
    });
  },
});

export default kubernetesModuleUpbound;

export { UpboundStrategy } from './UpboundStrategy';
