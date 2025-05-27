import { KubernetesRequestAuth } from '@backstage/plugin-kubernetes-common';
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  AuthMetadata,
  AuthenticationStrategy,
  ClusterDetails,
  KubernetesCredential,
} from '@backstage/plugin-kubernetes-node';
import { JsonObject } from '@backstage/types';

interface UpboundTokenResponse {
  access_token: string;
  issued_token_type: string;
  token_type: string;
  expires_in: number;
}

interface UpboundAuthConfig {
  authHost?: string;
  apiGroup?: string;
  apiVersion?: string;
  audiences?: string[];
}

export class UpboundStrategy implements AuthenticationStrategy {
  private readonly authHost: string;
  private readonly apiGroup: string;
  private readonly apiVersion: string;
  private readonly audiences: string[];

  constructor(
    private readonly logger: LoggerService,
    config: UpboundAuthConfig = {}
  ) {
    this.authHost = config.authHost || 'auth.upbound.io';
    this.apiGroup = config.apiGroup || 'tokenexchange.upbound.io';
    this.apiVersion = config.apiVersion || 'v1alpha1';
    this.audiences = config.audiences || [
      'upbound:spaces:api',
      'upbound:spaces:controlplanes'
    ];

    this.logger.info('UpboundStrategy initialized', {
      authHost: this.authHost,
      apiGroup: this.apiGroup,
      apiVersion: this.apiVersion,
      audienceCount: this.audiences.length
    });
  }

  public async getCredential(
    clusterDetails: ClusterDetails,
    requestAuth: KubernetesRequestAuth,
  ): Promise<KubernetesCredential> {
    this.logger.debug('Getting Upbound credential for cluster', {
      clusterName: clusterDetails.name,
      clusterUrl: clusterDetails.url,
    });

    // Extract Upbound-specific auth data from the request (optional)
    const upboundAuth = (requestAuth.upbound as JsonObject) || {};

    // Get token - priority: request auth > cluster authMetadata
    let staticToken = upboundAuth.token as string;
    if (!staticToken && clusterDetails.authMetadata) {
      staticToken = clusterDetails.authMetadata['upbound.io/token'] as string;
    }

    // Get organization - priority: request auth > cluster authMetadata
    let organization = upboundAuth.organization as string;
    if (!organization && clusterDetails.authMetadata) {
      organization = clusterDetails.authMetadata['upbound.io/organization'] as string;
    }

    if (!staticToken) {
      throw new Error(
        'Upbound token not found. Provide token in request auth or configure it in cluster authMetadata with key "upbound.io/token"'
      );
    }

    if (!organization) {
      throw new Error(
        'Upbound organization not found. Provide organization in request auth or configure it in cluster authMetadata with key "upbound.io/organization"'
      );
    }

    this.logger.debug('Using Upbound authentication', {
      organization,
      tokenSource: upboundAuth.token ? 'request' : 'cluster-metadata',
      clusterName: clusterDetails.name,
    });

    try {
      // Get organization-scoped token from Upbound
      const orgToken = await this.getOrgScopedToken(staticToken, organization);

      this.logger.debug('Successfully obtained org-scoped token', {
        organization,
        clusterName: clusterDetails.name,
        tokenType: orgToken.token_type,
        expiresIn: orgToken.expires_in,
      });

      return {
        type: 'bearer token',
        token: orgToken.access_token,
      };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to get Upbound org-scoped token', {
        errorMessage: errorObj.message,
        errorName: errorObj.name,
        organization,
        clusterName: clusterDetails.name,
        authHost: this.authHost,
      });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to authenticate with Upbound: ${errorMessage}`);
    }
  }

  public validateCluster(authMetadata: AuthMetadata): Error[] {
    this.logger.debug('Validating Upbound cluster auth metadata', {
      hasOrganization: !!authMetadata['upbound.io/organization'],
      hasToken: !!authMetadata['upbound.io/token']
    });
    return [];
  }

  public presentAuthMetadata(authMetadata: AuthMetadata): AuthMetadata {
    return {
      'upbound.io/organization': authMetadata['upbound.io/organization'],
      'upbound.io/authHost': this.authHost,
    };
  }

  private async getOrgScopedToken(
    staticToken: string,
    organization: string
  ): Promise<UpboundTokenResponse> {
    const basePath = `/apis/${this.apiGroup}/${this.apiVersion}`;
    const url = `https://${this.authHost}${basePath}/orgscopedtokens`;

    this.logger.debug('Requesting org-scoped token from Upbound', {
      organization,
      authHost: this.authHost,
      basePath,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const formData = new URLSearchParams();

      this.audiences.forEach(audience => {
        formData.append('audience', audience);
      });

      formData.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
      formData.append('subject_token_type', 'urn:ietf:params:oauth:token-type:id_token');
      formData.append('subject_token', staticToken);
      formData.append('scope', `upbound:org:${organization}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${staticToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        this.logger.error('Token exchange request failed', {
          status: response.status,
          statusText: response.statusText,
          errorBody,
          organization,
        });
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}. ${errorBody}`
        );
      }

      const tokenResponse: UpboundTokenResponse = await response.json();

      if (!tokenResponse.access_token) {
        throw new Error('Invalid token response: missing access_token');
      }

      this.logger.debug('Successfully obtained org-scoped token', {
        organization,
        expiresIn: tokenResponse.expires_in,
        tokenType: tokenResponse.token_type,
        issuedTokenType: tokenResponse.issued_token_type,
      });

      return tokenResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout while fetching Upbound token');
      }

      throw error;
    }
  }
}
