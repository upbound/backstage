# @internal/plugin-backstage-plugin-scaffolder-backend-module-crossplane-utils

The `scaffolder-backend-module-crossplane-utils` plugin for Backstage is a package of multiple scaffolder actions. These actions include:

- **upbound:claim-template**: This action converts input parameters into a Kubernetes YAML manifest for the Crossplane claim and writes it to the filesystem of the action based on the format "<cluster>/<namespace>/<kind>/<name>.yaml".
- **upbound:catalog-info-cleaner**: This action takes a Backstage entity and cleans up runtime information and then outputs as a catalog-info.yaml file on the filesystem of the action the cleaned up manifest. This is useful for auto-ingested components that you want to enable a push to git of the manifest to allow for a full git-based catalog management when needed.
