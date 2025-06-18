import { useState, useEffect } from 'react';
import { useTheme, Table, TableBody, TableCell, TableHead, TableRow, Paper, Button, Drawer, IconButton, TableSortLabel, Box, Dialog, DialogTitle, DialogContent, Typography } from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import { KubernetesObject } from '@backstage/plugin-kubernetes';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useEntity } from '@backstage/plugin-catalog-react';
import YAML from 'js-yaml';
import CloseIcon from '@material-ui/icons/Close';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { saveAs } from 'file-saver';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { usePermission } from '@backstage/plugin-permission-react';
import { listAdditionalResourcesPermission, showEventsAdditionalResourcesPermission, viewYamlAdditionalResourcesPermission } from '@terasky/backstage-plugin-crossplane-common';
import { configApiRef } from '@backstage/core-plugin-api';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import pluralize from 'pluralize';

interface ExtendedKubernetesObject extends KubernetesObject {
    status?: {
        conditions?: Array<{ type: string; status: string }>;
    };
    spec?: {
        package?: string;
    };
}

const removeManagedFields = (resource: KubernetesObject) => {
    const resourceCopy = JSON.parse(JSON.stringify(resource)); // Deep copy the resource
    if (resourceCopy.metadata) {
        if (resourceCopy.metadata.managedFields) {
            delete resourceCopy.metadata.managedFields;
        }
        if (resourceCopy.metadata.annotations && resourceCopy.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"]) {
            delete resourceCopy.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"];
        }
    }
    return resourceCopy;
};

const CrossplaneUsedResourcesTable = () => {
    const { entity } = useEntity();
    const kubernetesApi = useApi(kubernetesApiRef);
    const config = useApi(configApiRef);
    const theme = useTheme();
    const enablePermissions = config.getOptionalBoolean('crossplane.enablePermissions') ?? false;

    const [resources, setResources] = useState<Array<ExtendedKubernetesObject>>([]);
    const [selectedResource, setSelectedResource] = useState<ExtendedKubernetesObject | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
    const [events, setEvents] = useState<Array<any>>([]);
    const [order, setOrder] = useState<'asc' | 'desc'>('asc');
    const [orderBy, setOrderBy] = useState<string>('name');

    const canListResourcesTemp = usePermission({ permission: listAdditionalResourcesPermission }).allowed;
    const canViewYamlTemp = usePermission({ permission: viewYamlAdditionalResourcesPermission }).allowed;
    const canShowEventsTemp = usePermission({ permission: showEventsAdditionalResourcesPermission }).allowed;

    const canListResources = enablePermissions ? canListResourcesTemp : true;
    const canViewYaml = enablePermissions ? canViewYamlTemp : true;
    const canShowEvents = enablePermissions ? canShowEventsTemp : true;

    useEffect(() => {
        if (!canListResources) {
            return;
        }

        const fetchResources = async () => {
            const annotations = entity.metadata.annotations || {};
            const plural = annotations['terasky.backstage.io/claim-plural'];
            const group = annotations['terasky.backstage.io/claim-group'];
            const version = annotations['terasky.backstage.io/claim-version'];
            const labelSelector = annotations['backstage.io/kubernetes-label-selector'];
            const namespace = labelSelector.split(',').find(s => s.startsWith('crossplane.io/claim-namespace'))?.split('=')[1];
            const clusterOfClaim = annotations['backstage.io/managed-by-location'].split(": ")[1];

            if (!plural || !group || !version || !namespace || !clusterOfClaim) {
                return;
            }
            try {
                // Fetch related resources
                const xrdPlural = annotations['terasky.backstage.io/composite-plural'];
                const xrdGroup = annotations['terasky.backstage.io/composite-group'];
                const xrdName = `${xrdPlural}.${xrdGroup}`;
                const xrdVersion = annotations['terasky.backstage.io/composite-version'];
                const compositionName = annotations['terasky.backstage.io/composition-name'];
                const compositionFunctions = annotations['terasky.backstage.io/composition-functions']?.split(',') || [];

                if (xrdName) {
                    const xrdUrl = `/apis/apiextensions.crossplane.io/v1/compositeresourcedefinitions/${xrdName}`;
                    const xrdResponse = await kubernetesApi.proxy({
                        clusterName: clusterOfClaim,
                        path: xrdUrl,
                        init: { method: 'GET' },
                    });
                    const xrdResource = await xrdResponse.json();
                    setResources(prevResources => [...prevResources, xrdResource]);
                }

                if (compositionName) {
                    const compositionUrl = `/apis/apiextensions.crossplane.io/v1/compositions/${compositionName}`;
                    const compositionResponse = await kubernetesApi.proxy({
                        clusterName: clusterOfClaim,
                        path: compositionUrl,
                        init: { method: 'GET' },
                    });
                    const compositionResource = await compositionResponse.json();
                    setResources(prevResources => [...prevResources, compositionResource]);
                }

                compositionFunctions.forEach(async functionName => {
                    if (functionName !== "") {
                        const functionUrl = `/apis/pkg.crossplane.io/v1beta1/functions/${functionName}`;
                        const functionResponse = await kubernetesApi.proxy({
                            clusterName: clusterOfClaim,
                            path: functionUrl,
                            init: { method: 'GET' },
                        });
                        const functionResource = await functionResponse.json();
                        if (functionResource.kind === 'Status' && functionResource.status === 'Failure') {
                            setResources(prevResources => [...prevResources, {
                                kind: 'Function',
                                metadata: {
                                    name: functionResource.details.name,
                                },
                                status: {
                                    conditions: [{ type: 'Error', status: functionResource.message }],
                                },
                            }]);
                        } else {
                            setResources(prevResources => [...prevResources, functionResource]);
                        }
                    }
                });

                // Fetch composite resource
                const compositeUrl = `/apis/${xrdGroup}/${xrdVersion}/${xrdPlural}/${annotations['terasky.backstage.io/composite-name']}`;
                const compositeResponse = await kubernetesApi.proxy({
                    clusterName: clusterOfClaim,
                    path: compositeUrl,
                    init: { method: 'GET' },
                });
                const compositeResource = await compositeResponse.json();
                const resourceRefs = compositeResource.spec.resourceRefs || [];

                // Deduplicate managed resources based on kind and apiVersion
                const uniqueManagedResources = Array.from(new Set(resourceRefs.map((ref: { kind: any; apiVersion: any; }) => `${ref.kind}-${ref.apiVersion}`)))
                    .map(key => resourceRefs.find((ref: { kind: any; apiVersion: any; }) => `${ref.kind}-${ref.apiVersion}` === key));

                // Fetch provider resources
                const providerResourcesSet = new Set();
                const providerResources = await Promise.all(uniqueManagedResources.map(async (ref: any) => {
                    const crdUrl = `/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${pluralize(ref.kind.toLowerCase())}.${ref.apiVersion.split('/')[0]}`;
                    const crdResponse = await kubernetesApi.proxy({
                        clusterName: clusterOfClaim,
                        path: crdUrl,
                        init: { method: 'GET' },
                    });
                    const crd = await crdResponse.json();
                    const ownerReferences = crd.metadata.ownerReferences || [];
                    const providerRefs = ownerReferences.filter((ownerRef: { kind: string; }) => ownerRef.kind === 'Provider');
                    const providerResources = await Promise.all(providerRefs.map(async (providerRef: any) => {
                        const providerKey = `${providerRef.apiVersion}-${providerRef.name}`;
                        if (providerResourcesSet.has(providerKey)) {
                            return null;
                        }
                        providerResourcesSet.add(providerKey);
                        const providerUrl = `/apis/${providerRef.apiVersion}/providers/${providerRef.name}`;
                        const providerResponse = await kubernetesApi.proxy({
                            clusterName: clusterOfClaim,
                            path: providerUrl,
                            init: { method: 'GET' },
                        });
                        const providerResource = await providerResponse.json();
                        return providerResource;
                    }));
                    return providerResources.filter(Boolean);
                }));

                setResources(prevResources => [...prevResources, ...providerResources.flat()]);

            } catch (error) {
                console.error("Error fetching resources:", error);
            }
        };

        fetchResources();
    }, [kubernetesApi, entity, canListResources]);

    const handleViewYaml = (resource: ExtendedKubernetesObject) => {
        if (!canViewYaml) {
            return;
        }
        setSelectedResource(resource);
        setDrawerOpen(true);
    };

    const handleCloseDrawer = () => {
        setDrawerOpen(false);
        setSelectedResource(null);
    };

    const handleRequestSort = (property: string) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleDownloadYaml = (resource: ExtendedKubernetesObject) => {
        const yamlContent = YAML.dump(removeManagedFields(resource));
        const blob = new Blob([yamlContent], { type: 'text/yaml;charset=utf-8' });
        const fileName = `${resource.kind}-${resource.metadata?.name}.yaml`;
        saveAs(blob, fileName);
    };

    const handleGetEvents = async (resource: ExtendedKubernetesObject) => {
        if (!canShowEvents) {
            return;
        }

        const name = resource.metadata?.name;
        const kind = resource.kind;
        const clusterOfClaim = entity.metadata.annotations?.['backstage.io/managed-by-location'].split(": ")[1];

        if (!name || !clusterOfClaim) {
            return;
        }

        const url = `/api/v1/namespaces/default/events?fieldSelector=involvedObject.name=${name},involvedObject.kind=${kind}`;

        try {
            const response = await kubernetesApi.proxy({
                clusterName: clusterOfClaim,
                path: url,
                init: { method: 'GET' },
            });
            const eventsResponse = await response.json();
            setEvents(eventsResponse.items);
            setEventsDialogOpen(true);
        } catch (error) {
            console.error("Error fetching events:", error);
        }
    };

    const handleCloseEventsDialog = () => {
        setEventsDialogOpen(false);
        setEvents([]);
    };

    const getStatus = (resource: ExtendedKubernetesObject) => {
        if (!resource.status?.conditions) {
            return 'N/A';
        }
        return resource.status.conditions.map((condition: any) => (
            <Typography key={condition.type} component="div">
                {condition.type}: {condition.status}
            </Typography>
        ));
    };

    const getArtifact = (resource: ExtendedKubernetesObject) => {
        if (resource.kind === 'Composition') {
            return 'N/A';
        }
        const packageName = resource.spec?.package || 'N/A';

        if ((resource.kind === 'Function' || resource.kind === 'Provider') && packageName.startsWith('xpkg.upbound.io/')) {
            // Remove the 'xpkg.upbound.io/' prefix
            const [_, path] = packageName.split('xpkg.upbound.io/');
            // Split the remaining path into components
            const [org, nameWithVersion] = path.split('/');
            // Split name and version
            const [name, version] = nameWithVersion.split(':');

            const resourceType = resource.kind === 'Function' ? 'functions' : 'providers';
            // Only include version in URL if it's not in the format 'v' followed by a single number
            const versionPath = /^v\d$/.test(version) ? '' : `/${version}`;
            const marketplaceUrl = `https://marketplace.upbound.io/${resourceType}/${org}/${name}${versionPath}`;

            return (
                <a
                    href={marketplaceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'underline' }}
                >
                    {packageName}
                </a>
            );
        }

        return packageName;
    };

    const sortedResources = resources.sort((a, b) => {
        if (orderBy === 'name') {
            return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * (order === 'asc' ? 1 : -1);
        } else if (orderBy === 'creationTimestamp') {
            return (new Date(a.metadata?.creationTimestamp || '')).getTime() - (new Date(b.metadata?.creationTimestamp || '')).getTime() * (order === 'asc' ? 1 : -1);
        } else if (orderBy === 'kind') {
            return (a.kind || '').localeCompare(b.kind || '') * (order === 'asc' ? 1 : -1);
        } else if (orderBy === 'synced') {
            const aSynced = (a as any).status?.conditions?.some((condition: any) => condition.type === 'Synced') ? 'Yes' : 'No';
            const bSynced = (b as any).status?.conditions?.some((condition: any) => condition.type === 'Synced') ? 'Yes' : 'No';
            return aSynced.localeCompare(bSynced) * (order === 'asc' ? 1 : -1);
        } else if (orderBy === 'ready') {
            const aReady = (a as any).status?.conditions?.some((condition: any) => condition.type === 'Ready') ? 'Yes' : 'No';
            const bReady = (b as any).status?.conditions?.some((condition: any) => condition.type === 'Ready') ? 'Yes' : 'No';
            return aReady.localeCompare(bReady) * (order === 'asc' ? 1 : -1);
        }
        return 0;
    });

    if (!canListResources) {
        return <Typography>You don't have permissions to view claim resources</Typography>;
    }

    return (
        <>
            <Paper>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sortDirection={orderBy === 'kind' ? order : false}>
                                <TableSortLabel
                                    active={orderBy === 'kind'}
                                    direction={orderBy === 'kind' ? order : 'asc'}
                                    onClick={() => handleRequestSort('kind')}
                                >
                                    Type
                                </TableSortLabel>
                            </TableCell>
                            <TableCell sortDirection={orderBy === 'name' ? order : false}>
                                <TableSortLabel
                                    active={orderBy === 'name'}
                                    direction={orderBy === 'name' ? order : 'asc'}
                                    onClick={() => handleRequestSort('name')}
                                >
                                    Name
                                </TableSortLabel>
                            </TableCell>
                            <TableCell sortDirection={orderBy === 'status' ? order : false}>
                                <TableSortLabel
                                    active={orderBy === 'status'}
                                    direction={orderBy === 'status' ? order : 'asc'}
                                    onClick={() => handleRequestSort('status')}
                                >
                                    Status
                                </TableSortLabel>
                            </TableCell>
                            <TableCell sortDirection={orderBy === 'artifact' ? order : false}>
                                <TableSortLabel
                                    active={orderBy === 'artifact'}
                                    direction={orderBy === 'artifact' ? order : 'asc'}
                                    onClick={() => handleRequestSort('artifact')}
                                >
                                    Artifact
                                </TableSortLabel>
                            </TableCell>
                            <TableCell>Kubernetes YAML</TableCell>
                            <TableCell>Kubernetes Events</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedResources.map(resource => (
                            <TableRow key={resource.metadata?.uid || `${resource.kind}-${Math.random()}`}>
                                <TableCell>{resource.kind}</TableCell>
                                <TableCell>{resource.metadata?.name}</TableCell>
                                <TableCell>{getStatus(resource)}</TableCell>
                                <TableCell>{getArtifact(resource)}</TableCell>
                                <TableCell>
                                    <Button onClick={() => handleViewYaml(resource)} disabled={!canViewYaml}>View YAML</Button>
                                </TableCell>
                                <TableCell>
                                    <Button onClick={() => handleGetEvents(resource)} disabled={!canShowEvents}>Show Events</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
            <Drawer anchor="right" open={drawerOpen} onClose={handleCloseDrawer}>
                <div style={{ width: '50vw', padding: '16px' }}>
                    <IconButton onClick={handleCloseDrawer}>
                        <CloseIcon />
                    </IconButton>
                    {selectedResource && (
                        <>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                <CopyToClipboard text={YAML.dump(removeManagedFields(selectedResource))}>
                                    <Button variant="contained" color="primary">Copy to Clipboard</Button>
                                </CopyToClipboard>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    onClick={() => handleDownloadYaml(selectedResource)}
                                >
                                    Download YAML
                                </Button>
                            </Box>
                            <SyntaxHighlighter language="yaml" style={theme.palette.type === 'dark' ? dark : docco}>
                                {YAML.dump(removeManagedFields(selectedResource))}
                            </SyntaxHighlighter>
                        </>
                    )}
                </div>
            </Drawer>
            <Dialog open={eventsDialogOpen} onClose={handleCloseEventsDialog} maxWidth="xl" fullWidth>
                <DialogTitle>Events</DialogTitle>
                <DialogContent>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Type</TableCell>
                                <TableCell>Reason</TableCell>
                                <TableCell>Message</TableCell>
                                <TableCell>First Seen</TableCell>
                                <TableCell>Last Seen</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {events.map(event => (
                                <TableRow key={event.metadata?.uid}>
                                    <TableCell>{event.type}</TableCell>
                                    <TableCell>{event.reason}</TableCell>
                                    <TableCell>{event.message}</TableCell>
                                    <TableCell>{event.firstTimestamp}</TableCell>
                                    <TableCell>{event.lastTimestamp}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default CrossplaneUsedResourcesTable;
