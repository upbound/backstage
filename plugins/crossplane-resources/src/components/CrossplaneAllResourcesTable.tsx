import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  makeStyles,
  CircularProgress,
  IconButton,
  Drawer,
  Tabs,
  Tab,
  Chip
} from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import { KubernetesObject } from '@backstage/plugin-kubernetes';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { usePermission } from '@backstage/plugin-permission-react';
import {
  listClaimsPermission,
  listCompositeResourcesPermission,
  listManagedResourcesPermission
} from '@terasky/backstage-plugin-crossplane-common';
import { configApiRef } from '@backstage/core-plugin-api';
import { useNavigate } from 'react-router-dom';
import pluralize from 'pluralize';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@material-ui/icons/KeyboardArrowRight';
import DescriptionIcon from '@material-ui/icons/Description';
import CloseIcon from '@material-ui/icons/Close';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import GetAppIcon from '@material-ui/icons/GetApp';
import SvgIcon from '@material-ui/core/SvgIcon';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import yaml from 'js-yaml';

// Custom Sitemap Icon Component
const SitemapIcon = (props: any) => (
    <SvgIcon {...props} viewBox="0 0 576 512">
        <path d="M208 80c0-26.5 21.5-48 48-48l64 0c26.5 0 48 21.5 48 48l0 64c0 26.5-21.5 48-48 48l-8 0 0 40 152 0c30.9 0 56 25.1 56 56l0 32 8 0c26.5 0 48 21.5 48 48l0 64c0 26.5-21.5 48-48 48l-64 0c-26.5 0-48-21.5-48-48l0-64c0-26.5 21.5-48 48-48l8 0 0-32c0-4.4-3.6-8-8-8l-152 0 0 40 8 0c26.5 0 48 21.5 48 48l0 64c0 26.5-21.5 48-48 48l-64 0c-26.5 0-48-21.5-48-48l0-64c0-26.5 21.5-48 48-48l8 0 0-40-152 0c-4.4 0-8 3.6-8 8l0 32 8 0c26.5 0 48 21.5 48 48l0 64c0 26.5-21.5 48-48 48l-64 0c-26.5 0-48-21.5-48-48l0-64c0-26.5 21.5-48 48-48l8 0 0-32c0-30.9 25.1-56 56-56l152 0 0-40-8 0c-26.5 0-48-21.5-48-48l0-64z" />
    </SvgIcon>
);

interface ExtendedKubernetesObject extends KubernetesObject {
    apiVersion?: string;
    status?: {
        conditions?: Array<{
            type: string,
            status: string,
            reason?: string,
            lastTransitionTime?: string,
            message?: string
        }>;
    };
    spec?: {
        resourceRef?: {
            apiVersion?: string;
            kind?: string;
            name?: string;
        };
        resourceRefs?: Array<any>;
        providerConfigRef?: {
            name?: string;
        };
    };
}

interface ResourceTableRow {
    type: 'Claim' | 'XR' | 'MR';
    name: string;
    namespace?: string;
    group: string;
    kind: string;
    status: {
        synced: boolean;
        ready: boolean;
        conditions: any[];
    };
    createdAt: string;
    resource: ExtendedKubernetesObject;
    level: number;
    parentId?: string;
    isLastChild?: boolean;
}

interface K8sEvent {
    metadata?: {
        name?: string;
        namespace?: string;
        creationTimestamp?: string;
    };
    involvedObject?: {
        kind?: string;
        name?: string;
        namespace?: string;
    };
    reason?: string;
    message?: string;
    type?: string;
    firstTimestamp?: string;
    lastTimestamp?: string;
    count?: number;
}

const useStyles = makeStyles((theme) => ({
    table: {
        minWidth: 650,
    },
    tableContainer: {
        backgroundColor: '#ffffff',
        border: `1px solid ${theme.palette.grey[400]}`,
        borderRadius: '4px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    tableCell: {
        padding: theme.spacing(1, 2),
        borderBottom: `1px solid ${theme.palette.grey[300]}`,
    },
    headerCell: {
        fontWeight: 'bold',
        backgroundColor: '#ffffff',
        borderBottom: `1px solid ${theme.palette.grey[400]}`,
    },
    clickableRow: {
        '&:hover': {
            backgroundColor: theme.palette.action.hover,
        },
    },
    nestedRow: {
        backgroundColor: theme.palette.grey[50],
    },
    statusBadge: {
        padding: '2px 8px',
        borderRadius: '3px',
        fontSize: '10px',
        fontWeight: 'bold',
        display: 'inline-block',
        marginRight: '8px',
    },
    syncedSuccess: {
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        color: '#2e7d32',
    },
    syncedError: {
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        color: '#c62828',
    },
    readySuccess: {
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        color: '#2e7d32',
    },
    readyError: {
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        color: '#c62828',
    },
    tooltip: {
        backgroundColor: '#000000',
        color: '#ffffff',
        fontSize: '12px',
        padding: theme.spacing(1.5),
        maxWidth: 400,
        '& .MuiTooltip-arrow': {
            color: '#000000',
        },
    },
    tooltipContent: {
        maxWidth: 400,
        '& strong': {
            color: '#ffffff',
        },
    },
    typeBadge: {
        padding: '4px 12px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 'bold',
        textAlign: 'center',
        minWidth: '50px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
    },
    claimType: {
        backgroundColor: '#e3f2fd',
        color: '#1976d2',
    },
    xrType: {
        backgroundColor: '#f3e5f5',
        color: '#7b1fa2',
    },
    mrType: {
        backgroundColor: '#e8f5e9',
        color: '#388e3c',
    },
    expandIcon: {
        padding: 4,
        marginRight: theme.spacing(1),
    },
    resourceName: {
        display: 'flex',
        alignItems: 'center',
    },
    indent: {
        marginLeft: theme.spacing(4),
    },
    treePrefix: {
        fontFamily: 'monospace',
        color: 'inherit',
        fontSize: '12px',
        opacity: 0.7,
    },
    actionButtons: {
        display: 'flex',
        gap: theme.spacing(0.5),
    },
    iconButton: {
        padding: theme.spacing(0.5),
        '&:hover': {
            backgroundColor: theme.palette.action.hover,
        },
    },
    drawer: {
        width: 800,
        flexShrink: 0,
    },
    drawerPaper: {
        width: 800,
        padding: theme.spacing(2),
    },
    drawerHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing(2),
    },
    tabContent: {
        marginTop: theme.spacing(2),
        height: 'calc(100vh - 200px)',
        overflow: 'auto',
        position: 'relative',
    },
    yamlActions: {
        position: 'sticky',
        top: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'flex-end',
        gap: theme.spacing(1),
        padding: theme.spacing(1),
        backgroundColor: theme.palette.background.paper,
        zIndex: 1,
        borderBottom: `1px solid ${theme.palette.divider}`,
    },
    eventTable: {
        '& th': {
            fontWeight: 'bold',
        },
    },
    eventRow: {
        '&:hover': {
            backgroundColor: theme.palette.action.hover,
        },
    },
    normalEvent: {
        backgroundColor: theme.palette.info.light,
        color: theme.palette.info.contrastText,
    },
    warningEvent: {
        backgroundColor: theme.palette.warning.light,
        color: theme.palette.warning.contrastText,
    },
    errorEvent: {
        backgroundColor: theme.palette.error.light,
        color: theme.palette.error.contrastText,
    },
}));

const CrossplaneAllResourcesTable = () => {
    const { entity } = useEntity();
    const kubernetesApi = useApi(kubernetesApiRef);
    const config = useApi(configApiRef);
    const navigate = useNavigate();
    const enablePermissions = config.getOptionalBoolean('crossplane.enablePermissions') ?? false;

    const { allowed: canListClaimsTemp } = usePermission({ permission: listClaimsPermission });
    const { allowed: canListCompositeTemp } = usePermission({ permission: listCompositeResourcesPermission });
    const { allowed: canListManagedTemp } = usePermission({ permission: listManagedResourcesPermission });

    const canListClaims = enablePermissions ? canListClaimsTemp : true;
    const canListComposite = enablePermissions ? canListCompositeTemp : true;
    const canListManaged = enablePermissions ? canListManagedTemp : true;

    const [allResources, setAllResources] = useState<ResourceTableRow[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [nestedResources, setNestedResources] = useState<Record<string, ResourceTableRow[]>>({});
    const [initialExpansionDone, setInitialExpansionDone] = useState<boolean>(false);
    const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
    const [selectedTab, setSelectedTab] = useState<number>(0);
    const [selectedResource, setSelectedResource] = useState<ExtendedKubernetesObject | null>(null);
    const [events, setEvents] = useState<K8sEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState<boolean>(false);
    const classes = useStyles();

    const fetchNestedResources = async (parentResource: ExtendedKubernetesObject, parentId: string, level: number) => {
        const resourceRefs = parentResource.spec?.resourceRefs || [];
        const clusterOfComposite = entity.metadata.annotations?.['backstage.io/managed-by-location']?.split(": ")[1];

        if (!clusterOfComposite || resourceRefs.length === 0) return [];

        const nestedResourcesPromises = resourceRefs.map(async (ref: any, index: number) => {
            const [apiGroup, apiVersion] = ref.apiVersion.split('/');
            const kindPlural = pluralize(ref.kind.toLowerCase());
            const resourceUrl = `/apis/${apiGroup}/${apiVersion}/${kindPlural}/${ref.name}`;
            try {
                const resourceResponse = await kubernetesApi.proxy({
                    clusterName: clusterOfComposite,
                    path: resourceUrl,
                    init: { method: 'GET' },
                });
                const nestedResource: ExtendedKubernetesObject = await resourceResponse.json();

                // Determine if this is an XR (has resourceRefs) or MR (leaf resource)
                const resourceType = nestedResource.spec?.resourceRefs && nestedResource.spec.resourceRefs.length > 0 ? 'XR' : 'MR';

                return {
                    type: resourceType as 'XR' | 'MR',
                    name: nestedResource.metadata?.name || 'Unknown',
                    group: nestedResource.apiVersion?.split('/')[0] || 'Unknown',
                    kind: nestedResource.kind || 'Unknown',
                    status: {
                        synced: nestedResource.status?.conditions?.find(c => c.type === 'Synced')?.status === 'True' || false,
                        ready: nestedResource.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True' || false,
                        conditions: nestedResource.status?.conditions || []
                    },
                    createdAt: nestedResource.metadata?.creationTimestamp || '',
                    resource: nestedResource,
                    level: level,
                    parentId: parentId,
                    isLastChild: index === resourceRefs.length - 1
                };
            } catch (error) {
                console.error('Error fetching nested resource:', error);
                return null;
            }
        });

        const fetchedResources = (await Promise.all(nestedResourcesPromises)).filter(r => r !== null) as ResourceTableRow[];

        // Recursively fetch nested resources for XRs
        for (const resource of fetchedResources) {
            if (resource.type === 'XR' && resource.resource.spec?.resourceRefs) {
                const resourceId = resource.resource.metadata?.uid || `${resource.kind}-${resource.name}`;
                const deeperNested = await fetchNestedResources(resource.resource, resourceId, level + 1);
                if (deeperNested.length > 0) {
                    setNestedResources(prev => ({
                        ...prev,
                        [resourceId]: deeperNested
                    }));
                }
            }
        }

        return fetchedResources;
    };

    // Function to expand all resources recursively
    const expandAllResources = async (resources: ResourceTableRow[]) => {
        const newExpandedRows = new Set<string>();

        const expandRecursively = async (resourceList: ResourceTableRow[]) => {
            for (const resource of resourceList) {
                const resourceId = resource.resource.metadata?.uid || `${resource.kind}-${resource.name}`;
                if (resource.resource.spec?.resourceRefs && resource.resource.spec.resourceRefs.length > 0) {
                    newExpandedRows.add(resourceId);

                    // Fetch nested resources if not already loaded
                    if (!nestedResources[resourceId]) {
                        const nested = await fetchNestedResources(resource.resource, resourceId, resource.level + 1);
                        setNestedResources(prev => ({
                            ...prev,
                            [resourceId]: nested
                        }));

                        // Recursively expand nested resources
                        await expandRecursively(nested);
                    } else {
                        // If already loaded, just expand them recursively
                        await expandRecursively(nestedResources[resourceId]);
                    }
                }
            }
        };

        await expandRecursively(resources);
        setExpandedRows(newExpandedRows);
    };

    const fetchEvents = async (resource: ExtendedKubernetesObject) => {
        setLoadingEvents(true);
        const annotations = entity.metadata.annotations || {};
        const clusterOfComposite = annotations['backstage.io/managed-by-location']?.split(": ")[1];

        if (!clusterOfComposite) {
            setLoadingEvents(false);
            return;
        }

        try {
            let eventsUrl = '';
            if (resource.metadata?.namespace) {
                eventsUrl = `/api/v1/namespaces/${resource.metadata.namespace}/events?fieldSelector=involvedObject.name=${resource.metadata?.name}`;
            } else if (resource.metadata?.name) {
                // For cluster-scoped resources
                eventsUrl = `/api/v1/events?fieldSelector=involvedObject.name=${resource.metadata.name}`;
            } else {
                // No metadata available
                setLoadingEvents(false);
                return;
            }

            const eventsResponse = await kubernetesApi.proxy({
                clusterName: clusterOfComposite,
                path: eventsUrl,
                init: { method: 'GET' },
            });
            const eventsData = await eventsResponse.json();
            setEvents(eventsData.items || []);
        } catch (error) {
            console.error('Error fetching events:', error);
            setEvents([]);
        } finally {
            setLoadingEvents(false);
        }
    };

    const handleOpenDrawer = (resource: ExtendedKubernetesObject, tab: number) => {
        setSelectedResource(resource);
        setSelectedTab(tab);
        setDrawerOpen(true);

        if (tab === 1) {
            fetchEvents(resource);
        }
    };

    const handleCloseDrawer = () => {
        setDrawerOpen(false);
        setSelectedResource(null);
        setEvents([]);
    };

    const handleTabChange = (_: React.ChangeEvent<{}>, newValue: number) => {
        setSelectedTab(newValue);
        if (newValue === 1 && selectedResource) {
            fetchEvents(selectedResource);
        }
    };

    const handleCopyYaml = () => {
        if (selectedResource) {
            try {
                const yamlStr = yaml.dump(selectedResource);
                navigator.clipboard.writeText(yamlStr);
                // You could add a snackbar notification here
            } catch (error) {
                console.error('Failed to copy YAML:', error);
            }
        }
    };

    const handleDownloadYaml = () => {
        if (selectedResource) {
            try {
                const yamlStr = yaml.dump(selectedResource);
                const blob = new Blob([yamlStr], { type: 'text/yaml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${selectedResource.metadata?.name || 'resource'}.yaml`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Failed to download YAML:', error);
            }
        }
    };

    useEffect(() => {
        const fetchAllResources = async () => {
            setLoading(true);
            const resources: ResourceTableRow[] = [];
            const annotations = entity.metadata.annotations || {};

            try {
                // Fetch Claim Resource
                if (canListClaims) {
                    const claimName = annotations['terasky.backstage.io/claim-name'];
                    const plural = annotations['terasky.backstage.io/claim-plural'];
                    const group = annotations['terasky.backstage.io/claim-group'];
                    const version = annotations['terasky.backstage.io/claim-version'];
                    const labelSelector = annotations['backstage.io/kubernetes-label-selector'];
                    const namespace = labelSelector?.split(',').find(s => s.startsWith('crossplane.io/claim-namespace'))?.split('=')[1];
                    const clusterOfClaim = annotations['backstage.io/managed-by-location']?.split(": ")[1];

                    if (plural && group && version && namespace && clusterOfClaim) {
                        const url = `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${claimName}`;
                        try {
                            const response = await kubernetesApi.proxy({
                                clusterName: clusterOfClaim,
                                path: url,
                                init: { method: 'GET' },
                            });
                            const claimResource: ExtendedKubernetesObject = await response.json();
                            resources.push({
                                type: 'Claim',
                                name: claimResource.metadata?.name || 'Unknown',
                                namespace: claimResource.metadata?.namespace,
                                group: claimResource.apiVersion?.split('/')[0] || 'Unknown',
                                kind: claimResource.kind || 'Unknown',
                                status: {
                                    synced: claimResource.status?.conditions?.find(c => c.type === 'Synced')?.status === 'True' || false,
                                    ready: claimResource.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True' || false,
                                    conditions: claimResource.status?.conditions || []
                                },
                                createdAt: claimResource.metadata?.creationTimestamp || '',
                                resource: claimResource,
                                level: 0
                            });
                        } catch (error) {
                            console.error('Error fetching claim:', error);
                        }
                    }
                }

                // Fetch Composite Resource
                if (canListComposite) {
                    const compositePlural = annotations['terasky.backstage.io/composite-plural'];
                    const compositeGroup = annotations['terasky.backstage.io/composite-group'];
                    const compositeVersion = annotations['terasky.backstage.io/composite-version'];
                    const compositeName = annotations['terasky.backstage.io/composite-name'];
                    const clusterOfComposite = annotations['backstage.io/managed-by-location']?.split(": ")[1];

                    if (compositePlural && compositeGroup && compositeVersion && compositeName && clusterOfComposite) {
                        const url = `/apis/${compositeGroup}/${compositeVersion}/${compositePlural}/${compositeName}`;
                        try {
                            const response = await kubernetesApi.proxy({
                                clusterName: clusterOfComposite,
                                path: url,
                                init: { method: 'GET' },
                            });
                            const compositeResource: ExtendedKubernetesObject = await response.json();
                            resources.push({
                                type: 'XR',
                                name: compositeResource.metadata?.name || 'Unknown',
                                group: compositeResource.apiVersion?.split('/')[0] || 'Unknown',
                                kind: compositeResource.kind || 'Unknown',
                                status: {
                                    synced: compositeResource.status?.conditions?.find(c => c.type === 'Synced')?.status === 'True' || false,
                                    ready: compositeResource.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True' || false,
                                    conditions: compositeResource.status?.conditions || []
                                },
                                createdAt: compositeResource.metadata?.creationTimestamp || '',
                                resource: compositeResource,
                                level: 0
                            });

                            // Fetch top-level managed resources
                            if (canListManaged && compositeResource.spec?.resourceRefs) {
                                const compositeId = compositeResource.metadata?.uid || `${compositeResource.kind}-${compositeResource.metadata?.name}`;
                                const managedResources = await fetchNestedResources(compositeResource, compositeId, 1);
                                resources.push(...managedResources);
                            }
                        } catch (error) {
                            console.error('Error fetching composite resource:', error);
                        }
                    }
                }

                setAllResources(resources);

                // Expand all resources by default after initial load
                if (!initialExpansionDone) {
                    await expandAllResources(resources);
                    setInitialExpansionDone(true);
                }
            } catch (error) {
                console.error('Error fetching resources:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchAllResources();
    }, [kubernetesApi, entity, canListClaims, canListComposite, canListManaged, enablePermissions]);

    const handleRowExpand = async (resource: ResourceTableRow) => {
        const resourceId = resource.resource.metadata?.uid || `${resource.kind}-${resource.name}`;
        const newExpandedRows = new Set(expandedRows);

        if (expandedRows.has(resourceId)) {
            newExpandedRows.delete(resourceId);
            setExpandedRows(newExpandedRows);
            return;
        }

        newExpandedRows.add(resourceId);
        setExpandedRows(newExpandedRows);

        // Fetch nested resources if they haven't been loaded yet
        if (!nestedResources[resourceId] && resource.resource.spec?.resourceRefs) {
            const nested = await fetchNestedResources(resource.resource, resourceId, resource.level + 1);
            setNestedResources(prev => ({
                ...prev,
                [resourceId]: nested
            }));
        }
    };

    const getConditionStatus = (conditions: any[], conditionType: string): { status: string; condition: any } => {
        const condition = conditions?.find(c => c.type === conditionType);
        return {
            status: condition?.status || 'Unknown',
            condition: condition || {}
        };
    };

    const renderStatusBadge = (conditions: any[], conditionType: string) => {
        const { status, condition } = getConditionStatus(conditions, conditionType);
        const isSuccess = status === 'True';

        const badgeClass = conditionType === 'Synced'
            ? (isSuccess ? classes.syncedSuccess : classes.syncedError)
            : (isSuccess ? classes.readySuccess : classes.readyError);

        return (
            <Tooltip
                classes={{
                    tooltip: classes.tooltip,
                }}
                title={
                    <Box className={classes.tooltipContent}>
                        <Typography variant="subtitle2" gutterBottom>
                            <strong>Condition: {condition.type}</strong>
                        </Typography>
                        <Typography variant="body2">Status: {condition.status}</Typography>
                        {condition.reason && (
                            <Typography variant="body2">Reason: {condition.reason}</Typography>
                        )}
                        {condition.lastTransitionTime && (
                            <Typography variant="body2">
                                Last Transition: {new Date(condition.lastTransitionTime).toLocaleString()}
                            </Typography>
                        )}
                        {condition.message && (
                            <Typography variant="body2" style={{ wordWrap: 'break-word' }}>
                                Message: {condition.message}
                            </Typography>
                        )}
                    </Box>
                }
                arrow
            >
                <span className={`${classes.statusBadge} ${badgeClass}`}>
                    {conditionType}
                </span>
            </Tooltip>
        );
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };

    const getRelativeTime = (dateString?: string) => {
        if (!dateString) return 'Unknown';

        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) {
            return `${diffInSeconds} second${diffInSeconds !== 1 ? 's' : ''} ago`;
        }

        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) {
            return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
        }

        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) {
            return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
        }

        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 30) {
            return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
        }

        const diffInMonths = Math.floor(diffInDays / 30);
        if (diffInMonths < 12) {
            return `${diffInMonths} month${diffInMonths !== 1 ? 's' : ''} ago`;
        }

        const diffInYears = Math.floor(diffInMonths / 12);
        return `${diffInYears} year${diffInYears !== 1 ? 's' : ''} ago`;
    };

    const getTypeBadgeClass = (type: string) => {
        switch (type) {
            case 'Claim':
                return classes.claimType;
            case 'XR':
                return classes.xrType;
            case 'MR':
                return classes.mrType;
            default:
                return '';
        }
    };

    const getTreePrefix = (level: number, isLastChild?: boolean) => {
        if (level === 0) return '';

        // Just return the tree branch symbol without spacing
        return isLastChild ? '└' : '├';
    };

    const getEventTypeChip = (type?: string) => {
        switch (type) {
            case 'Warning':
                return <Chip size="small" label={type} className={classes.warningEvent} />;
            case 'Error':
                return <Chip size="small" label={type} className={classes.errorEvent} />;
            default:
                return <Chip size="small" label={type || 'Normal'} className={classes.normalEvent} />;
        }
    };

    // Function to count all resources including nested ones
    const getTotalResourceCount = (): number => {
        let count = allResources.filter(r => !r.parentId).length; // Count top-level resources

        // Recursively count expanded nested resources
        const countNested = (parentId: string): number => {
            const nested = nestedResources[parentId];
            if (!nested) return 0;

            let nestedCount = nested.length;
            nested.forEach(resource => {
                const resourceId = resource.resource.metadata?.uid || `${resource.kind}-${resource.name}`;
                if (expandedRows.has(resourceId)) {
                    nestedCount += countNested(resourceId);
                }
            });
            return nestedCount;
        };

        // Count nested resources for each expanded top-level resource
        allResources.filter(r => !r.parentId).forEach(resource => {
            const resourceId = resource.resource.metadata?.uid || `${resource.kind}-${resource.name}`;
            if (expandedRows.has(resourceId)) {
                count += countNested(resourceId);
            }
        });

        return count;
    };

    const renderResourceRows = (resources: ResourceTableRow[], _?: string): JSX.Element[] => {
        const rows: JSX.Element[] = [];

        resources.forEach((row, index) => {
            const resourceId = row.resource.metadata?.uid || `${row.kind}-${row.name}-${index}`;
            const hasNestedResources = row.resource.spec?.resourceRefs && row.resource.spec.resourceRefs.length > 0;
            const isExpanded = expandedRows.has(resourceId);

            rows.push(
                <TableRow
                    key={resourceId}
                    className={`${classes.clickableRow} ${row.level > 0 ? classes.nestedRow : ''}`}
                >
                    <TableCell className={classes.tableCell}>
                        <span className={`${classes.typeBadge} ${getTypeBadgeClass(row.type)}`}>
                            <span style={{ width: row.level * 4, display: 'inline-block' }}></span>
                            {row.level > 0 && (
                                <span className={classes.treePrefix}>
                                    {getTreePrefix(row.level, row.isLastChild)}
                                </span>
                            )}
                            {row.type}
                        </span>
                    </TableCell>
                    <TableCell className={classes.tableCell}>
                        <Box className={classes.resourceName}>
                            {hasNestedResources && (
                                <IconButton
                                    className={classes.expandIcon}
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRowExpand(row);
                                    }}
                                >
                                    {isExpanded ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}
                                </IconButton>
                            )}
                            {row.name}
                        </Box>
                    </TableCell>
                    <TableCell className={classes.tableCell}>
                        {row.group}
                    </TableCell>
                    <TableCell className={classes.tableCell}>
                        {row.kind}
                    </TableCell>
                    <TableCell className={classes.tableCell}>
                        <Box display="flex">
                            {renderStatusBadge(row.status.conditions, 'Synced')}
                            {renderStatusBadge(row.status.conditions, 'Ready')}
                        </Box>
                    </TableCell>
                    <TableCell className={classes.tableCell}>
                        <Tooltip
                            classes={{
                                tooltip: classes.tooltip,
                            }}
                            title={formatDate(row.createdAt)}
                            arrow
                        >
                            <span style={{ cursor: 'help' }}>
                                {getRelativeTime(row.createdAt)}
                            </span>
                        </Tooltip>
                    </TableCell>
                    <TableCell className={classes.tableCell}>
                        <Box className={classes.actionButtons}>
                            <Tooltip title="View Graph">
                                <IconButton
                                    className={classes.iconButton}
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/catalog/${entity.metadata.namespace}/component/${entity.metadata.name}/crossplane-graph`);
                                    }}
                                >
                                    <SitemapIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="View YAML & Events">
                                <IconButton
                                    className={classes.iconButton}
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenDrawer(row.resource, 0);
                                    }}
                                >
                                    <DescriptionIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </TableCell>
                </TableRow>
            );

            // Add nested resources if expanded
            if (isExpanded && nestedResources[resourceId]) {
                rows.push(...renderResourceRows(nestedResources[resourceId], resourceId));
            }
        });

        return rows;
    };

    if (!canListClaims && !canListComposite && !canListManaged) {
        return (
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Resources ({getTotalResourceCount()})
                    </Typography>
                    <Box m={2}>
                        <Typography gutterBottom>
                            You don't have permissions to view Crossplane resources
                        </Typography>
                    </Box>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Resources ({getTotalResourceCount()})
                    </Typography>

                    {loading ? (
                        <Box display="flex" justifyContent="center" alignItems="center" height="200px">
                            <CircularProgress />
                        </Box>
                    ) : allResources.length > 0 ? (
                        <TableContainer component={Paper} className={classes.tableContainer}>
                            <Table className={classes.table} size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Type</TableCell>
                                        <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Name</TableCell>
                                        <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Group</TableCell>
                                        <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Kind</TableCell>
                                        <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Status</TableCell>
                                        <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Created</TableCell>
                                        <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {renderResourceRows(allResources.filter(r => !r.parentId))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Typography>No resources found</Typography>
                    )}
                </CardContent>
            </Card>

            <Drawer
                className={classes.drawer}
                variant="temporary"
                anchor="right"
                open={drawerOpen}
                onClose={handleCloseDrawer}
                classes={{
                    paper: classes.drawerPaper,
                }}
            >
                <Box className={classes.drawerHeader}>
                    <Typography variant="h6">
                        {selectedResource?.metadata?.name || 'Resource Details'}
                    </Typography>
                    <IconButton onClick={handleCloseDrawer}>
                        <CloseIcon />
                    </IconButton>
                </Box>

                <Tabs value={selectedTab} onChange={handleTabChange}>
                    <Tab label="Kubernetes Manifest" />
                    <Tab label="Kubernetes Events" />
                </Tabs>

                <Box className={classes.tabContent}>
                    {selectedTab === 0 && selectedResource && (
                        <>
                            <Box className={classes.yamlActions}>
                                <Tooltip title="Copy YAML">
                                    <IconButton size="small" onClick={handleCopyYaml}>
                                        <FileCopyIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Download YAML">
                                    <IconButton size="small" onClick={handleDownloadYaml}>
                                        <GetAppIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                            <SyntaxHighlighter
                                language="yaml"
                                style={tomorrow}
                                showLineNumbers
                            >
                                {yaml.dump(selectedResource)}
                            </SyntaxHighlighter>
                        </>
                    )}

                    {selectedTab === 1 && (
                        loadingEvents ? (
                            <Box display="flex" justifyContent="center" p={3}>
                                <CircularProgress />
                            </Box>
                        ) : events.length > 0 ? (
                            <TableContainer>
                                <Table size="small" className={classes.eventTable}>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Reason</TableCell>
                                            <TableCell>Age</TableCell>
                                            <TableCell>Message</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {events.map((event, index) => (
                                            <TableRow key={index} className={classes.eventRow}>
                                                <TableCell>{getEventTypeChip(event.type)}</TableCell>
                                                <TableCell>{event.reason}</TableCell>
                                                <TableCell>{getRelativeTime(event.lastTimestamp || event.firstTimestamp)}</TableCell>
                                                <TableCell>{event.message}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        ) : (
                            <Typography align="center" color="textSecondary">
                                No events found for this resource
                            </Typography>
                        )
                    )}
                </Box>
            </Drawer>
        </>
    );
};

export default CrossplaneAllResourcesTable;
