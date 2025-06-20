# @internal/plugin-kubernetes-ingestor


The `kubernetes-ingestor` backend plugin for Backstage is a catalog entity provider that creates catalog entities directly from Kubernetes resources. It has the ability to ingest by default all standard Kubernetes workload types, allows supplying custom GVKs, and has the ability to auto-ingest all Crossplane claims automatically as components. There are numerous annotations which can be put on the Kubernetes workloads to influence the creation of the component in Backstage. It also supports creating Backstage templates and registers them in the catalog for every XRD in your cluster for the Claim resource type. Currently, this supports adding via a PR to a GitHub/GitLab/Bitbucket repo or providing a download link to the generated YAML without pushing to git. The plugin also generates API entities for all XRDs and defines the dependencies and relationships between all claims and the relevant APIs for easy discoverability within the portal.


## Configuration
```yaml
kubernetesIngestor:
  # Mappings of kubernetes resource metadata to backstage entity metadata
  # The list bellow are the default values when the mappings are not set in the app-config.yaml
  # The recommended values are:
  # namespaceModel: 'cluster' # cluster, namespace, default
  # nameModel: 'name-cluster' # name-cluster, name-namespace, name
  # titleModel: 'name' # name, name-cluster, name-namespace
  # systemModel: 'cluster-namespace' # cluster, namespace, cluster-namespace, default
  # referencesNamespaceModel: 'default' # default, same
  mappings:
    namespaceModel: 'cluster' # cluster, namespace, default
    nameModel: 'name-cluster' # name-cluster, name-namespace, name-kind, name
    titleModel: 'name' # name, name-cluster, name-namespace
    systemModel: 'namespace' # cluster, namespace, cluster-namespace, default
    referencesNamespaceModel: 'default' # default, same
  # A list of cluster names to ingest resources from. If empty, resources from all clusters under kubernetes.clusterLocatorMethods.clusters will be ingested.
  # allowedClusterNames:
  #   - my-cluster-name
  components:
    # Whether to enable creation of backstage components for Kubernetes workloads
    enabled: true
    taskRunner:
      # How often to query the clusters for data
      frequency: 10
      # Max time to process the data per cycle
      timeout: 600
    # Namespaces to exclude the resources from
    excludedNamespaces:
      - kube-public
      - kube-system
    # Custom Resource Types to also generate components for
    customWorkloadTypes:
      - group: pkg.crossplane.io
        apiVersion: v1
        plural: providers
        # singular: provider # explicit singular form - needed when auto-detection fails
    # By default all standard kubernetes workload types are ingested. This allows you to disable this behavior
    disableDefaultWorkloadTypes: false
    # Allows ingestion to be opt-in or opt-out by either requiring or not a dedicated annotation to ingest a resource (upbound.backstage.io/add-to-catalog or upbound.backstage.io/exclude-from-catalog)
    onlyIngestAnnotatedResources: false
  crossplane:
    # This section is relevant for crossplane v1 claims as well as Crossplane v2 XRs.
    # In the future when v1 and claims are deprecated this field will change names but currently
    # for backwards compatibility will stay as is
    claims:
      # Whether to create components for all claim resources (v1) and XRs (v2) in your cluster
      ingestAllClaims: true
    xrds:
      # Settings related to the final steps of a software template
      publishPhase:
        # Base URLs of Git servers you want to allow publishing to
        allowedTargets: ['github.com', 'gitlab.com']
        # What to publish to. currently supports github, gitlab, bitbucket, and YAML (provides a link to download the file)
        target: github
        git:
          # Follows the backstage standard format which is github.com?owner=<REPO OWNER>&repo=<REPO NAME>
          repoUrl:
          targetBranch: main
        # Whether the user should be able to select the repo they want to push the manifest to or not
        allowRepoSelection: true
      # Whether to enable the creation of software templates for all XRDs
      enabled: true
      taskRunner:
        # How often to query the clusters for data
        frequency: 10
        # Max time to process the data per cycle
        timeout: 600
      # Allows ingestion to be opt-in or opt-out by either requiring or not a dedicated annotation to ingest a xrd (upbound.backstage.io/add-to-catalog or upbound.backstage.io/exclude-from-catalog)
      ingestAllXRDs: true
      # Will convert default values from the XRD into placeholders in the UI instead of always adding them to the generated manifest.
      convertDefaultValuesToPlaceholders: true
  genericCRDTemplates:
    # Settings related to the final steps of a software template
    publishPhase:
      # Base URLs of Git servers you want to allow publishing to
      allowedTargets: ['github.com', 'gitlab.com']
      # What to publish to. currently supports github, gitlab, bitbucket, and YAML (provides a link to download the file)
      target: github
      git:
        # Follows the backstage standard format which is github.com?owner=<REPO OWNER>&repo=<REPO NAME>
        repoUrl:
        targetBranch: main
      # Whether the user should be able to select the repo they want to push the manifest to or not
      allowRepoSelection: true
    crdLabelSelector:
      key: upbound.backstage.io/generate-form
      value: "true"
    crds:
      - certificates.cert-manager.io
```

This plugins supports the following annotations on kuberenetes resources:
```yaml
General Annotations:
- upbound.backstage.io/add-to-catalog: Defaults to false. this is used when onlyIngestAnnotatedResources is set to true and or when ingestAllXRDs is set to false in the app-config.yaml
- upbound.backstage.io/exclude-from-catalog: Defaults to true. this is used when onlyIngestAnnotatedResources is set to false and or when ingestAllXRDs is set to true in the app-config.yaml
- upbound.backstage.io/system: Defaults to the kubernetes namespace of the resource
- upbound.backstage.io/backstage-namespace: Defaults to default
- upbound.backstage.io/owner: Defaults to kubernetes-auto-ingested
Namespace Annotations:
- upbound.backstage.io/system-type: Defaults to product
- upbound.backstage.io/domain: no default
Workload Resource Annotations:
- upbound.backstage.io/source-code-repo-url: no default. format: "https://github.com/dambor/yelb-catalog"
- upbound.backstage.io/source-branch: Defaults to main
- upbound.backstage.io/techdocs-path: no default. format: "components/redis-server"
- upbound.backstage.io/kubernetes-label-selector: Only needed for non crossplane claims. in the format of 'app=yelb-ui,tier=frontend'
- upbound.backstage.io/component-type: Defaults to service
- upbound.backstage.io/lifecycle: Defaults to production
- upbound.backstage.io/dependsOn: no default. format: 'Component:yelb-appserver'
- upbound.backstage.io/providesApis: no default. format: 'petstore-api,other-ns/other-api'
- upbound.backstage.io/consumesApis: no default. format: 'petstore-api,other-ns/other-api'
- upbound.backstage.io/component-annotations: no default - allows supplying nested annotation key value pairs to be added to components. format: 'test.upbound.com/example=dummy-value,demo=example'
- upbound.backstage.io/links: no default - allows supplying backstage links to add to your component. format: '[{"url": "https://docs.crossplane.io/","title": "Crossplane Docs","icon": "docs"}]'
```
