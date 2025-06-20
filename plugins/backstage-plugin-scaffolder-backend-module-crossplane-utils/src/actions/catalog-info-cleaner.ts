import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { resolveSafeChildPath } from '@backstage/backend-plugin-api';
import yaml from 'js-yaml';
import fs from 'fs-extra';

export function createCatalogInfoCleanerAction() {
    return createTemplateAction<{
        entity: Record<string, any>;
    }>({
        id: 'terasky:catalog-info-cleaner',
        description: 'Templates a claim manifest based on input parameters',
        schema: {
            input: {
                type: 'object',
                properties: {
                    entity: {
                        title: 'Pass through of entity object',
                        description: "Pass through of entity object",
                        type: 'object',
                    },
                },
            },
            output: {
                type: 'object',
                properties: {
                    manifest: {
                        title: 'Manifest',
                        description: 'The templated Kubernetes resource manifest',
                        type: 'string',
                    },
                    filePath: {
                        title: 'path',
                        description: 'The file path of the written manifests',
                        type: 'string',
                    },
                },
            },
        },
        async handler(ctx) {
            ctx.logger.info(
                `Running example template with parameters: ${JSON.stringify(ctx.input.entity)}`,
            );
            const manifest = ctx.input.entity;
            // Remove the metadata.uid field from the entity
            delete manifest.metadata.uid;
            delete manifest.metadata.etag;
            delete manifest.metadata.annotations['backstage.io/managed-by-location'];
            delete manifest.metadata.annotations['backstage.io/managed-by-origin-location'];
            delete manifest.relations;

            // Construct the YAML with the specific structure
            const manifestYaml = yaml.dump({
                apiVersion: manifest.apiVersion,
                kind: manifest.kind,
                metadata: {
                    name: manifest.metadata.name,
                    namespace: manifest.metadata.namespace,
                    annotations: manifest.metadata.annotations,
                    ...manifest.metadata,
                },
                spec: {
                    type: manifest.spec.type,
                    system: manifest.spec.system,
                    owner: manifest.spec.owner,
                    lifecycle: manifest.spec.lifecycle,
                    ...manifest.spec,
                },
            });

            // Write the manifest to the file system for each cluster
            const filePath = "./catalog-info.yaml";
            const destFilepath = resolveSafeChildPath(ctx.workspacePath, filePath);
            fs.outputFileSync(destFilepath, manifestYaml);
            ctx.logger.info(`Manifest written to ${destFilepath}`);

            // Output the manifest and file paths
            ctx.output('manifest', manifestYaml);
            ctx.output('filePath', destFilepath);
        },
    });
}
