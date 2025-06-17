import { Fragment, useState, useEffect } from 'react';
import { useTheme, Table, TableBody, TableCell, TableHead, TableRow, Paper, Button, Drawer, IconButton, TableSortLabel, CircularProgress, Typography, Box, Dialog, DialogTitle, DialogContent } from '@material-ui/core';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
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
import { listManagedResourcesPermission, viewYamlManagedResourcesPermission, showEventsManagedResourcesPermission } from '@terasky/backstage-plugin-crossplane-common';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import pluralize from 'pluralize';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@material-ui/icons/KeyboardArrowRight';
import { makeStyles } from '@material-ui/core/styles';
import Collapse from '@material-ui/core/Collapse';

interface ExtendedKubernetesObject extends KubernetesObject {
    spec?: {
        providerConfigRef?: {
            name?: string;
        };
        resourceRefs?: any[];
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

const useStyles = makeStyles((theme) => ({
    nestedTableContainer: {
        marginLeft: theme.spacing(4),
        marginRight: theme.spacing(2),
        marginBottom: theme.spacing(2),
        backgroundColor: theme.palette.background.default,
        borderRadius: theme.shape.borderRadius,
        border: `1px solid ${theme.palette.divider}`,
    },
    expandIcon: {
        marginRight: theme.spacing(1),
        padding: 4,
    },
    nestedRow: {
        '& > td': {
            borderBottom: 'none',
            paddingBottom: 0,
            paddingTop: 0,
        }
    },
    resourceTypeCell: {
        display: 'flex',
        alignItems: 'center',
    },
    nestedTable: {
        '& th': {
            backgroundColor: theme.palette.background.paper,
            fontWeight: theme.typography.fontWeightMedium,
        },
    }
}));

const CrossplaneManagedResources = () => {
    const { entity } = useEntity();
    const kubernetesApi = useApi(kubernetesApiRef);
    const config = useApi(configApiRef);
    const theme = useTheme();
    const enablePermissions = config.getOptionalBoolean('crossplane.enablePermissions') ?? false;
    const [resources, setResources] = useState<Array<ExtendedKubernetesObject>>([]);
    const [loading, setLoading] = useState(true);
    const [selectedResource, setSelectedResource] = useState<ExtendedKubernetesObject | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
    const [events, setEvents] = useState<Array<any>>([]);
    const [order, setOrder] = useState<'asc' | 'desc'>('asc');
    const [orderBy, setOrderBy] = useState<string>('name');
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [nestedResources, setNestedResources] = useState<Record<string, ExtendedKubernetesObject[]>>({});
    const classes = useStyles();

    const canListManagedResourcesTemp = usePermission({ permission: listManagedResourcesPermission }).allowed;
    const canViewYamlTemp = usePermission({ permission: viewYamlManagedResourcesPermission }).allowed;
    const canShowEventsTemp = usePermission({ permission: showEventsManagedResourcesPermission }).allowed;

    const canListManagedResources = enablePermissions ? canListManagedResourcesTemp : true;
    const canViewYaml = enablePermissions ? canViewYamlTemp : true;
    const canShowEvents = enablePermissions ? canShowEventsTemp : true;

    useEffect(() => {
        if (!canListManagedResources) {
            setLoading(false);
            return;
        }

        const fetchResources = async () => {
            setLoading(true);
            const annotations = entity.metadata.annotations || {};
            const plural = annotations['terasky.backstage.io/composite-plural'];
            const group = annotations['terasky.backstage.io/composite-group'];
            const version = annotations['terasky.backstage.io/composite-version'];
            const name = annotations['terasky.backstage.io/composite-name'];
            const clusterOfComposite = annotations['backstage.io/managed-by-location'].split(": ")[1];

            if (!plural || !group || !version || !name || !clusterOfComposite) {
                setLoading(false);
                return;
            }

            const url = `/apis/${group}/${version}/${plural}/${name}`;

            try {
                const response = await kubernetesApi.proxy({
                    clusterName: clusterOfComposite,
                    path: url,
                    init: { method: 'GET' },
                });
                const compositeResource = await response.json();
                const resourceRefs = compositeResource.spec.resourceRefs || [];

                const managedResources = await Promise.all(resourceRefs.map(async (ref: any) => {
                    const [apiGroup, apiVersion] = ref.apiVersion.split('/');
                    const kindPlural = pluralize(ref.kind.toLowerCase());
                    const resourceUrl = `/apis/${apiGroup}/${apiVersion}/${kindPlural}/${ref.name}`;
                    const resourceResponse = await kubernetesApi.proxy({
                        clusterName: clusterOfComposite,
                        path: resourceUrl,
                        init: { method: 'GET' },
                    });
                    return await resourceResponse.json();
                }));

                setResources(managedResources);
            } catch (error) {
                throw error;
            } finally {
                setLoading(false);
            }
        };

        fetchResources();
    }, [kubernetesApi, entity, canListManagedResources]);

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
        const namespace = 'default';
        const name = resource.metadata?.name;
        const kind = resource.kind;
        const clusterOfClaim = entity.metadata.annotations?.['backstage.io/managed-by-location'].split(": ")[1];
        if (!namespace || !name || !clusterOfClaim) {
            return;
        }

        const url = `/api/v1/namespaces/${namespace}/events?fieldSelector=involvedObject.name=${name},involvedObject.kind=${kind}`;
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
            throw error
        }
    };

    const handleCloseEventsDialog = () => {
        setEventsDialogOpen(false);
        setEvents([]);
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
        } else if (orderBy === 'providerConfig') {
            return (a.spec?.providerConfigRef?.name || '').localeCompare(b.spec?.providerConfigRef?.name || '') * (order === 'asc' ? 1 : -1);
        }
        return 0;
    });

    const fetchNestedResources = async (resource: ExtendedKubernetesObject) => {
        const resourceRefs = resource.spec?.resourceRefs || [];
        const clusterOfComposite = entity.metadata.annotations?.['backstage.io/managed-by-location'].split(": ")[1];

        if (!clusterOfComposite) return [];

        const managedResources = await Promise.all(resourceRefs.map(async (ref: any) => {
            const [apiGroup, apiVersion] = ref.apiVersion.split('/');
            const kindPlural = pluralize(ref.kind.toLowerCase());
            const resourceUrl = `/apis/${apiGroup}/${apiVersion}/${kindPlural}/${ref.name}`;
            const resourceResponse = await kubernetesApi.proxy({
                clusterName: clusterOfComposite,
                path: resourceUrl,
                init: { method: 'GET' },
            });
            return await resourceResponse.json();
        }));

        return managedResources;
    };

    const handleRowExpand = async (resource: ExtendedKubernetesObject) => {
        const resourceId = resource.metadata?.uid || '';
        const newExpandedRows = new Set(expandedRows);

        if (expandedRows.has(resourceId)) {
            newExpandedRows.delete(resourceId);
            setExpandedRows(newExpandedRows);
            return;
        }

        newExpandedRows.add(resourceId);
        setExpandedRows(newExpandedRows);

        if (!nestedResources[resourceId] && resource.spec?.resourceRefs) {
            const nested = await fetchNestedResources(resource);
            setNestedResources(prev => ({
                ...prev,
                [resourceId]: nested
            }));
        }
    };

    if (!canListManagedResources) {
        return <Typography>You don't have permissions to view managed resources</Typography>;
    }

    return (
        <>
            <Paper>
                {loading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                        <CircularProgress />
                    </Box>
                ) : (
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
                                <TableCell sortDirection={orderBy === 'synced' ? order : false}>
                                    <TableSortLabel
                                        active={orderBy === 'synced'}
                                        direction={orderBy === 'synced' ? order : 'asc'}
                                        onClick={() => handleRequestSort('synced')}
                                    >
                                        Synced
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell sortDirection={orderBy === 'ready' ? order : false}>
                                    <TableSortLabel
                                        active={orderBy === 'ready'}
                                        direction={orderBy === 'ready' ? order : 'asc'}
                                        onClick={() => handleRequestSort('ready')}
                                    >
                                        Ready
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell sortDirection={orderBy === 'providerConfig' ? order : false}>
                                    <TableSortLabel
                                        active={orderBy === 'providerConfig'}
                                        direction={orderBy === 'providerConfig' ? order : 'asc'}
                                        onClick={() => handleRequestSort('providerConfig')}
                                    >
                                        Provider Config
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>Kubernetes YAML</TableCell>
                                <TableCell>Kubernetes Events</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sortedResources.map(resource => (
                                <Fragment key={resource.metadata?.uid || `${resource.kind}-${Math.random()}`}>
                                    <TableRow>
                                        <TableCell>
                                            <div className={classes.resourceTypeCell}>
                                                {resource.spec?.resourceRefs && (
                                                    <IconButton
                                                        className={classes.expandIcon}
                                                        size="small"
                                                        onClick={() => handleRowExpand(resource)}
                                                    >
                                                        {expandedRows.has(resource.metadata?.uid || '') ?
                                                            <KeyboardArrowDownIcon /> :
                                                            <KeyboardArrowRightIcon />
                                                        }
                                                    </IconButton>
                                                )}
                                                {resource.kind}
                                            </div>
                                        </TableCell>
                                        <TableCell>{resource.metadata?.name}</TableCell>
                                        <TableCell>{(resource as any).status?.conditions?.some((condition: any) => condition.type === 'Synced') ? 'Yes' : 'No'}</TableCell>
                                        <TableCell>{(resource as any).status?.conditions?.some((condition: any) => condition.type === 'Ready') ? 'Yes' : 'No'}</TableCell>
                                        <TableCell>{resource.spec?.providerConfigRef?.name || 'N/A'}</TableCell>
                                        <TableCell>
                                            <Button onClick={() => handleViewYaml(resource)} disabled={!canViewYaml}>View YAML</Button>
                                        </TableCell>
                                        <TableCell>
                                            <Button onClick={() => handleGetEvents(resource)} disabled={!canShowEvents}>Show Events</Button>
                                        </TableCell>
                                    </TableRow>
                                    {expandedRows.has(resource.metadata?.uid || '') && resource.spec?.resourceRefs && (
                                        <TableRow className={classes.nestedRow}>
                                            <TableCell colSpan={7}>
                                                <Collapse in={expandedRows.has(resource.metadata?.uid || '')} timeout="auto">
                                                    <Box className={classes.nestedTableContainer}>
                                                        <Table size="small" className={classes.nestedTable}>
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell>Type</TableCell>
                                                                    <TableCell>Name</TableCell>
                                                                    <TableCell>Synced</TableCell>
                                                                    <TableCell>Ready</TableCell>
                                                                    <TableCell>Provider Config</TableCell>
                                                                    <TableCell>Kubernetes YAML</TableCell>
                                                                    <TableCell>Kubernetes Events</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {(nestedResources[resource.metadata?.uid || ''] || []).map(nestedResource => (
                                                                    <TableRow key={nestedResource.metadata?.uid}>
                                                                        <TableCell>{nestedResource.kind}</TableCell>
                                                                        <TableCell>{nestedResource.metadata?.name}</TableCell>
                                                                        <TableCell>
                                                                            {(nestedResource as any).status?.conditions?.some(
                                                                                (condition: any) => condition.type === 'Synced'
                                                                            ) ? 'Yes' : 'No'}
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {(nestedResource as any).status?.conditions?.some(
                                                                                (condition: any) => condition.type === 'Ready'
                                                                            ) ? 'Yes' : 'No'}
                                                                        </TableCell>
                                                                        <TableCell>{nestedResource.spec?.providerConfigRef?.name || 'N/A'}</TableCell>
                                                                        <TableCell>
                                                                            <Button
                                                                                variant="outlined"
                                                                                size="small"
                                                                                onClick={() => handleViewYaml(nestedResource)}
                                                                                disabled={!canViewYaml}
                                                                            >
                                                                                View YAML
                                                                            </Button>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <Button
                                                                                variant="outlined"
                                                                                size="small"
                                                                                onClick={() => handleGetEvents(nestedResource)}
                                                                                disabled={!canShowEvents}
                                                                            >
                                                                                Show Events
                                                                            </Button>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </Box>
                                                </Collapse>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            ))}
                        </TableBody>
                    </Table>
                )}
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

export default CrossplaneManagedResources;
