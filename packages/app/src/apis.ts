import {
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
  ScmAuth,
} from '@backstage/integration-react';
import {
  AnyApiFactory,
  configApiRef,
  createApiFactory,
} from '@backstage/core-plugin-api';

import { kubernetesAuthProvidersApiRef } from '@backstage/plugin-kubernetes';

class UpboundKubernetesAuthProvider {
  async decorateRequestBodyForAuth(requestBody: any): Promise<any> {
    return {
      ...requestBody,
      auth: {
        ...requestBody.auth,
        upbound: {}
      }
    };
  }

  async getCredentials(): Promise<{ token?: string }> {
    // For server-side auth, no frontend token needed
    return {};
  }
}

class CustomKubernetesAuthProviders {
  private authProviders = new Map();

  constructor() {
    // Register Upbound auth provider
    this.authProviders.set('upbound', new UpboundKubernetesAuthProvider());
  }

  async decorateRequestBodyForAuth(authProvider: string, requestBody: any): Promise<any> {
    console.log(`Decorating request for auth provider: ${authProvider}`);

    const provider = this.authProviders.get(authProvider);
    if (provider && provider.decorateRequestBodyForAuth) {
      return await provider.decorateRequestBodyForAuth(requestBody);
    }

    // If no provider found, return original request body
    return requestBody;
  }

  async getCredentials(authProvider: string): Promise<{ token?: string }> {
    console.log(`Getting credentials for auth provider: ${authProvider}`);

    const provider = this.authProviders.get(authProvider);
    if (provider && provider.getCredentials) {
      return await provider.getCredentials();
    }

    // Return empty object if no provider found
    return {};
  }
}

// Auth providers API factory
const kubernetesAuthProvidersApiFactory = createApiFactory({
  api: kubernetesAuthProvidersApiRef,
  deps: {},
  factory: () => {
    return new CustomKubernetesAuthProviders();
  },
});

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
  ScmAuth.createDefaultApiFactory(),
  kubernetesAuthProvidersApiFactory,
];
