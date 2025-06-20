import { useState, useEffect } from 'react';
import {
    useTheme,
    Drawer,
    IconButton,
    Box,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
    CircularProgress,
    Tabs,
    Tab,
    Tooltip,
    TableContainer,
    Chip,
    makeStyles
} from '@material-ui/core';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import { KubernetesObject } from '@backstage/plugin-kubernetes';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useEntity } from '@backstage/plugin-catalog-react';
import * as yaml from 'js-yaml';
import CloseIcon from '@material-ui/icons/Close';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import GetAppIcon from '@material-ui/icons/GetApp';
import { saveAs } from 'file-saver';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

import ReactFlow, { ReactFlowProvider, MiniMap, Controls, Background, Node, Edge, Handle, Position } from 'react-flow-renderer';
import dagre from 'dagre';
import { usePermission } from '@backstage/plugin-permission-react';
import { showResourceGraph } from '@internal/plugin-crossplane-common-backend';

const useStyles = makeStyles((theme) => ({
    drawer: {
        width: '50vw',
        flexShrink: 0,
    },
    drawerPaper: {
        width: '50vw',
        backgroundColor: theme.palette.background.default,
    },
    drawerHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: theme.spacing(2),
        borderBottom: `1px solid ${theme.palette.divider}`,
    },
    tabContent: {
        padding: theme.spacing(2),
        height: 'calc(100vh - 180px)',
        overflow: 'auto',
    },
    yamlActions: {
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: theme.spacing(1),
        gap: theme.spacing(1),
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
}));

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

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 172;
const nodeHeight = 80;

const getLayoutedElements = (nodes: any[], edges: any[], claimNodeId?: string) => {
    // Configure dagre with top-down layout first to get better vertical distribution
    dagreGraph.setGraph({
        rankdir: 'LR',
        align: 'UL', // Align to upper-left
        ranksep: 100, // Horizontal spacing between ranks
        nodesep: 50,  // Vertical spacing between nodes
        marginx: 20,
        marginy: 20
    });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    // Find the bounds of the graph
    let minX = Infinity;
    let minY = Infinity;

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const x = nodeWithPosition.x - nodeWidth / 2;
        const y = nodeWithPosition.y - nodeHeight / 2;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
    });

    // Find the claim node (if specified) or the root node (node with no incoming edges)
    let rootNodeId = claimNodeId;
    if (!rootNodeId) {
        // Find nodes with no incoming edges (potential roots)
        const nodesWithIncomingEdges = new Set(edges.map(e => e.target));
        const rootNodes = nodes.filter(n => !nodesWithIncomingEdges.has(n.id));

        // Prefer the claim node if found
        const claimNode = rootNodes.find(n => n.data.categoryBadge === 'Claim');
        rootNodeId = claimNode?.id || rootNodes[0]?.id;
    }

    // Position nodes with offset to start at top-left
    const offsetX = 50; // Start 50px from left
    const offsetY = 50; // Start 50px from top

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = 'left';
        node.sourcePosition = 'right';

        // Calculate position relative to minimum bounds
        const x = nodeWithPosition.x - nodeWidth / 2 - minX + offsetX;
        const y = nodeWithPosition.y - nodeHeight / 2 - minY + offsetY;

        node.position = { x, y };
    });

    // If we have a root node, ensure it's at the top-left
    if (rootNodeId) {
        const rootNode = nodes.find(n => n.id === rootNodeId);
        if (rootNode) {
            // Find the minimum Y position among all nodes at the same X level
            const rootX = rootNode.position.x;
            let minYAtRootLevel = rootNode.position.y;

            nodes.forEach(node => {
                if (Math.abs(node.position.x - rootX) < 10) { // Nodes at approximately the same X
                    minYAtRootLevel = Math.min(minYAtRootLevel, node.position.y);
                }
            });

            // Adjust root node to be at the top
            rootNode.position.y = minYAtRootLevel;
        }
    }

    return { nodes, edges };
};

const CustomNode = ({ data }: { data: any }) => {
    const theme = useTheme();

    // Truncate text with ellipsis if too long
    const truncateText = (text: string, maxLength: number = 20) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    };

    // Define badge colors based on category
    const getBadgeStyles = (categoryBadge: string) => {
        switch (categoryBadge) {
            case 'Claim':
                return {
                    backgroundColor: '#e3f2fd',
                    color: '#1976d2'
                };
            case 'XR':
                return {
                    backgroundColor: '#f3e5f5',
                    color: '#7b1fa2'
                };
            case 'MR':
                return {
                    backgroundColor: '#e8f5e9',
                    color: '#388e3c'
                };
            default:
                return {
                    backgroundColor: theme.palette.primary.main,
                    color: 'white'
                };
        }
    };

    const badgeStyles = getBadgeStyles(data.categoryBadge);

    return (
        <div
            style={{
                padding: '8px',
                border: `1px solid ${theme.palette.grey[400]}`,
                backgroundColor: '#ffffff',
                color: theme.palette.text.primary,
                fontSize: '12px',
                width: nodeWidth,
                minHeight: nodeHeight + 20,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                position: 'relative',
                borderRadius: '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                boxSizing: 'border-box',
                cursor: 'pointer'
            }}
            onMouseEnter={() => data.onHover(data.nodeId)}
            onMouseLeave={() => data.onHover(null)}
        >
            <Handle
                type="target"
                position={Position.Left}
                style={{ background: 'transparent', border: 'none' }}
            />

            {/* Header section with Kind and Category badge */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                marginBottom: '4px',
                alignItems: 'flex-start',
                gap: '4px'
            }}>
                <span style={{
                    fontWeight: 'bold',
                    fontSize: '14px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                }}>
                    {truncateText(data.kind)}
                </span>
                {data.categoryBadge && (
                    <span style={{
                        backgroundColor: badgeStyles.backgroundColor,
                        color: badgeStyles.color,
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        flexShrink: 0
                    }}>
                        {data.categoryBadge}
                    </span>
                )}
            </div>

            {/* API Version */}
            <div style={{
                fontStyle: 'italic',
                fontSize: '11px',
                color: theme.palette.text.secondary,
                marginBottom: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%'
            }}>
                {truncateText(data.apiVersion, 25)}
            </div>

            {/* Name */}
            <div style={{
                fontSize: '12px',
                marginBottom: '6px',
                wordBreak: 'break-word',
                width: '100%'
            }}>
                {data.name}
            </div>

            {/* Status indicators */}
            <div style={{
                width: '100%',
                borderTop: `1px solid ${theme.palette.grey[300]}`,
                marginTop: 'auto',
                paddingTop: '6px'
            }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{
                        backgroundColor: data.isSynced ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                        color: data.isSynced ? '#2e7d32' : '#c62828',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: 'bold'
                    }}>
                        Synced
                    </div>
                    <div style={{
                        backgroundColor: data.isReady ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                        color: data.isReady ? '#2e7d32' : '#c62828',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: 'bold'
                    }}>
                        Ready
                    </div>
                </div>
            </div>

            {data.hasChildren && (
                <>
                    {/* Bridge line to connect node to button */}
                    <div
                        style={{
                            position: 'absolute',
                            right: -15,
                            top: '50%',
                            width: 15,
                            height: 2,
                            backgroundColor: '#999',
                            transform: 'translateY(-50%)',
                            zIndex: 1
                        }}
                    />
                    {/* Collapse/Expand button */}
                    <div
                        style={{
                            position: 'absolute',
                            right: -28,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            cursor: 'pointer',
                            backgroundColor: '#000000',
                            border: `1px solid #000000`,
                            borderRadius: '50%',
                            width: 16,
                            height: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            color: '#ffffff',
                            userSelect: 'none',
                            zIndex: 2,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onToggle(data.nodeId);
                        }}
                    >
                        {data.isCollapsed ? '+' : '-'}
                    </div>
                </>
            )}
            <Handle
                type="source"
                position={Position.Right}
                style={{ background: 'transparent', border: 'none' }}
            />
        </div>
    );
};

const nodeTypes = {
    custom: CustomNode,
};

const CrossplaneResourceGraph = () => {
    const { entity } = useEntity();
    const theme = useTheme();
    const classes = useStyles();
    const kubernetesApi = useApi(kubernetesApiRef);
    const config = useApi(configApiRef);
    const enablePermissions = config.getOptionalBoolean('crossplane.enablePermissions') ?? false;
    const [resources, setResources] = useState<Array<KubernetesObject>>([]);
    const [selectedResource, setSelectedResource] = useState<KubernetesObject | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedTab, setSelectedTab] = useState(0);
    const [events, setEvents] = useState<Array<any>>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

    const canShowResourceGraphTemp = usePermission({ permission: showResourceGraph }).allowed;
    const canShowResourceGraph = enablePermissions ? canShowResourceGraphTemp : true;

    const toggleNodeCollapse = (nodeId: string) => {
        setCollapsedNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId);
            } else {
                newSet.add(nodeId);
            }
            return newSet;
        });
    };

    const generateGraphElements = (resourceList: KubernetesObject[]) => {
        // First, create a map to track which nodes have children
        const nodeHasChildren = new Map<string, boolean>();
        // Track node ready status for edge coloring
        const nodeReadyStatus = new Map<string, boolean>();

        // First pass: determine node statuses
        resourceList.forEach(resource => {
            const status = (resource as any).status;
            const conditions = status?.conditions || [];
            const isReady = conditions.some((condition: any) => condition.type === 'Ready' && condition.status === 'True');
            const nodeId = resource.metadata?.uid || `${resource.kind}-${Math.random()}`;
            nodeReadyStatus.set(nodeId, isReady);
        });

        // Build all edges first to determine parent-child relationships
        const allEdgesWithDuplicates = resourceList.flatMap(resource => {
            const ownerReferences = resource.metadata?.ownerReferences || [];
            const resourceRef = (resource as any).spec?.resourceRef;
            const resourceRefUid = resourceList.find(res => res.metadata?.name === resourceRef?.name && res.kind === resourceRef?.kind)?.metadata?.uid;
            const currentNodeId = resource.metadata?.uid || `${resource.kind}-${Math.random()}`;

            const ownerEdges = ownerReferences.map(owner => {
                nodeHasChildren.set(owner.uid, true);
                const targetReady = nodeReadyStatus.get(currentNodeId) ?? true;
                const isErrorEdge = !targetReady;

                return {
                    id: `${owner.uid}-${currentNodeId}`,
                    source: owner.uid,
                    target: currentNodeId,
                    type: 'smoothstep',
                    style: {
                        stroke: isErrorEdge ? '#f44336' : '#999',
                        strokeWidth: 1,
                        zIndex: isErrorEdge ? 10 : 1
                    },
                    animated: false,
                    zIndex: isErrorEdge ? 10 : 1
                };
            });

            const resourceRefEdges = resourceRefUid ? [{
                id: `${currentNodeId}-${resourceRefUid}`,
                source: currentNodeId,
                target: resourceRefUid,
                type: 'smoothstep',
                style: {
                    stroke: !nodeReadyStatus.get(resourceRefUid) ? '#f44336' : '#999',
                    strokeWidth: 1,
                    zIndex: !nodeReadyStatus.get(resourceRefUid) ? 10 : 1
                },
                animated: false,
                zIndex: !nodeReadyStatus.get(resourceRefUid) ? 10 : 1
            }] : [];

            if (resourceRefEdges.length > 0) {
                nodeHasChildren.set(currentNodeId, true);
            }

            return [...ownerEdges, ...resourceRefEdges];
        });

        // Deduplicate edges by their ID
        const edgeMap = new Map<string, any>();
        allEdgesWithDuplicates.forEach(edge => {
            edgeMap.set(edge.id, edge);
        });
        const allEdges = Array.from(edgeMap.values());

        // Track the claim node ID
        let claimNodeId: string | undefined;

        // Find the claim node first (it should be the entity's claim)
        const claimName = entity.metadata.annotations?.['terasky.backstage.io/claim-name'];
        const claimResource = resourceList.find(r => r.metadata?.name === claimName);

        // Helper function to determine category badge
        const determineCategoryBadge = (resource: KubernetesObject, isClaimNode: boolean = false): string => {
            // First node is always the Claim
            if (isClaimNode) {
                return 'Claim';
            }

            // Check for XR vs MR based on resourceRefs
            const spec = (resource as any).spec;

            // XR: Has resourceRefs array with items
            if (spec?.resourceRefs && Array.isArray(spec.resourceRefs) && spec.resourceRefs.length > 0) {
                return 'XR';
            }

            // Additional XR check: Has compositionRef or compositionSelector
            if (spec?.compositionRef || spec?.compositionSelector) {
                return 'XR';
            }

            // Additional XR check: Has composedTemplate (for newer Crossplane versions)
            if (spec?.composedTemplate || spec?.composition) {
                return 'XR';
            }

            // MR: Leaf resource (no resourceRefs or empty resourceRefs)
            // This includes managed resources from providers
            return 'MR';
        };

        // Create nodes
        const nodes = resourceList.map(resource => {
            const status = (resource as any).status;
            const conditions = status?.conditions || [];
            const isSynced = conditions.some((condition: any) => condition.type === 'Synced' && condition.status === 'True');
            const isReady = conditions.some((condition: any) => condition.type === 'Ready' && condition.status === 'True');

            const resourceName = resource.metadata?.name || 'Unknown';
            const resourceKind = resource.kind || 'Unknown';
            const apiVersion = (resource as any).apiVersion || '';
            const nodeId = resource.metadata?.uid || `${resource.kind}-${Math.random()}`;

            // Determine if this is the claim node
            const isClaimNode = resource === claimResource || resource.metadata?.name === claimName;

            // Determine category badge
            const categoryBadge = determineCategoryBadge(resource, isClaimNode);

            // Track claim node
            if (categoryBadge === 'Claim' && !claimNodeId) {
                claimNodeId = nodeId;
            }

            return {
                id: nodeId,
                type: 'custom',
                data: {
                    kind: resourceKind,
                    apiVersion: apiVersion,
                    name: resourceName,
                    isSynced: isSynced,
                    isReady: isReady,
                    categoryBadge: categoryBadge,
                    hasChildren: nodeHasChildren.has(nodeId),
                    isCollapsed: collapsedNodes.has(nodeId),
                    nodeId: nodeId,
                    onToggle: toggleNodeCollapse,
                    onHover: setHoveredNode
                },
                position: { x: 0, y: 0 }, // Initial position, will be updated by dagre layout
                style: {
                    zIndex: nodeHasChildren.has(nodeId) ? 100 : 1
                },
                zIndex: nodeHasChildren.has(nodeId) ? 100 : 1
            };
        });

        // Get all descendant nodes recursively
        const getAllDescendants = (nodeId: string, descendants: Set<string> = new Set()) => {
            allEdges
                .filter(edge => edge.source === nodeId)
                .forEach(edge => {
                    descendants.add(edge.target);
                    getAllDescendants(edge.target, descendants);
                });
            return descendants;
        };

        // Build set of all hidden nodes (including collapsed nodes themselves)
        const hiddenNodes = new Set<string>();
        collapsedNodes.forEach(collapsedNodeId => {
            // Don't hide the collapsed node itself, just its descendants
            const descendants = getAllDescendants(collapsedNodeId);
            descendants.forEach(id => hiddenNodes.add(id));
        });

        console.log('Hidden nodes:', Array.from(hiddenNodes));

        // Filter visible nodes
        const visibleNodes = nodes.filter(node => !hiddenNodes.has(node.id));

        // Get all visible node IDs for quick lookup
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

        // Also add collapsed nodes to visible set (they should be visible, just their children are hidden)
        collapsedNodes.forEach(id => visibleNodeIds.add(id));

        // Filter edges - show edges only when both nodes are visible AND source is not collapsed
        const visibleEdges = allEdges.filter(edge => {
            // Hide all edges from collapsed nodes
            if (collapsedNodes.has(edge.source)) {
                return false;
            }
            // Hide edges where either endpoint is hidden
            if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
                return false;
            }
            return true;
        });

        // Apply hover effects to edges
        const styledEdges = visibleEdges.map(edge => {
            if (!hoveredNode) return edge;

            // Find all connected nodes (ancestors and descendants)
            const connectedNodes = new Set<string>();

            // Find ancestors
            const findAncestors = (nodeId: string) => {
                allEdges.forEach(e => {
                    if (e.target === nodeId && !connectedNodes.has(e.source)) {
                        connectedNodes.add(e.source);
                        findAncestors(e.source);
                    }
                });
            };

            // Find descendants
            const findDescendants = (nodeId: string) => {
                allEdges.forEach(e => {
                    if (e.source === nodeId && !connectedNodes.has(e.target)) {
                        connectedNodes.add(e.target);
                        findDescendants(e.target);
                    }
                });
            };

            // Add the hovered node itself
            connectedNodes.add(hoveredNode);
            findAncestors(hoveredNode);
            findDescendants(hoveredNode);

            // Check if this edge is part of the path
            const isInPath = connectedNodes.has(edge.source) && connectedNodes.has(edge.target);

            return {
                ...edge,
                style: {
                    ...edge.style,
                    strokeDasharray: isInPath ? '5,5' : 'none',
                    strokeWidth: isInPath ? 2 : 1,
                    opacity: isInPath ? 1 : 0.3,
                    zIndex: edge.style?.zIndex || 1
                },
                animated: isInPath,
                zIndex: edge.zIndex || 1
            };
        });

        // Sort edges so that red (error) edges are rendered last (on top)
        const sortedEdges = styledEdges.sort((a, b) => {
            const aIsRed = a.style?.stroke === '#f44336';
            const bIsRed = b.style?.stroke === '#f44336';

            if (aIsRed && !bIsRed) return 1;  // a (red) goes after b
            if (!aIsRed && bIsRed) return -1; // b (red) goes after a
            return 0; // maintain original order for same color
        });

        // Pass the claim node ID to the layout function
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(visibleNodes, sortedEdges, claimNodeId);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    };

    useEffect(() => {
        if (resources.length > 0) {
            generateGraphElements(resources);
        }
    }, [collapsedNodes, resources, hoveredNode]);

    useEffect(() => {
        if (!canShowResourceGraph) {
            setLoading(false);
            return;
        }

        const fetchResources = async () => {
            const annotations = entity.metadata.annotations || {};
            const claimName = annotations['terasky.backstage.io/claim-name'];
            const clusterOfClaim = annotations['backstage.io/managed-by-location'].split(": ")[1];
            const plural = annotations['terasky.backstage.io/claim-plural'];
            const group = annotations['terasky.backstage.io/claim-group'];
            const version = annotations['terasky.backstage.io/claim-version'];
            const labelSelector = annotations['backstage.io/kubernetes-label-selector'];
            const namespace = labelSelector.split(',').find(s => s.startsWith('crossplane.io/claim-namespace'))?.split('=')[1];
            const crdMap: Map<string, any> = new Map();

            try {
                const response = await kubernetesApi.proxy({
                    clusterName: clusterOfClaim,
                    path: '/apis',
                    init: {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json;g=apidiscovery.k8s.io;v=v2beta1;as=APIGroupDiscoveryList,application/json',
                        },
                    },
                });

                const apiGroupDiscoveryList = await response.json();

                apiGroupDiscoveryList.items.forEach((group: any) => {
                    group.versions.forEach((version: any) => {
                        version.resources.forEach((resource: any) => {
                            if (resource.categories?.some((category: string) => ['crossplane', 'managed', 'composite', 'claim'].includes(category))) {
                                // Use composite key to prevent collisions between same resource names in different groups
                                const resourceKey = `${group.metadata.name}/${version.version}/${resource.resource}`;
                                crdMap.set(resourceKey, {
                                    group: group.metadata.name,
                                    apiVersion: version.version,
                                    plural: resource.resource,
                                });
                            }
                        });
                    });
                });

                const customResources = Array.from(crdMap.values());

                console.log('Discovered custom resources:', customResources.length);
                console.log('Resource types:', customResources.map(r => `${r.group}/${r.apiVersion}/${r.plural}`));

                const resourcesResponse = await kubernetesApi.getCustomObjectsByEntity({
                    entity,
                    auth: { type: 'serviceAccount' },
                    customResources,
                });

                const allResources = resourcesResponse.items.flatMap(item =>
                    item.resources.flatMap(resourceGroup => resourceGroup.resources)
                ).filter(resource => resource);

                console.log('Fetched resources:', allResources.length);
                console.log('Resource details:', allResources.map(r => `${r.kind}/${r.metadata?.name} (${(r as any).apiVersion})`));

                // Fetch the claim resource
                const resourceName = claimName;
                const url = `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${resourceName}`;

                try {
                    const response = await kubernetesApi.proxy({
                        clusterName: clusterOfClaim,
                        path: url,
                        init: { method: 'GET' },
                    });
                    const claimResource = await response.json();
                    allResources.push(claimResource);
                    console.log('Added claim resource:', claimResource.kind, claimResource.metadata?.name);
                } catch (error) {
                    console.error('Failed to fetch claim resource:', error);
                }

                setResources(allResources);
                setNodes([]);
                setEdges([]);
            } catch (error) {
                console.error('Failed to fetch resources:', error);
                throw error;
            } finally {
                setLoading(false);
            }
        };

        fetchResources();
    }, [kubernetesApi, entity, canShowResourceGraph]);

    const handleGetEvents = async (resource: KubernetesObject) => {
        const namespace = resource.metadata?.namespace || 'default';
        const name = resource.metadata?.name;
        const clusterOfClaim = entity.metadata.annotations?.['backstage.io/managed-by-location'].split(": ")[1];

        if (!namespace || !name || !clusterOfClaim) {
            console.warn('Missing required data for fetching events:', { namespace, name, clusterOfClaim });
            return;
        }

        setLoadingEvents(true);
        const url = `/api/v1/namespaces/${namespace}/events?fieldSelector=involvedObject.name=${name}`;

        try {
            const response = await kubernetesApi.proxy({
                clusterName: clusterOfClaim,
                path: url,
                init: { method: 'GET' },
            });
            const eventsResponse = await response.json();
            setEvents(eventsResponse.items || []);
        } catch (error) {
            console.error('Failed to fetch events:', error);
            setEvents([]);
        } finally {
            setLoadingEvents(false);
        }
    };

    const handleElementClick = async (_event: any, element: any) => {
        const resource = resources.find(res => res.metadata?.uid === element.id);
        if (resource) {
            setSelectedResource(resource);
            setDrawerOpen(true);
            setSelectedTab(0); // Reset to first tab
            await handleGetEvents(resource); // Fetch events when a resource is selected
        }
    };

    const handleCloseDrawer = () => {
        setDrawerOpen(false);
        setSelectedResource(null);
        setEvents([]);
        setSelectedTab(0);
    };

    const handleTabChange = (_event: React.ChangeEvent<{}>, newValue: number) => {
        setSelectedTab(newValue);
    };

    const handleCopyYaml = () => {
        if (selectedResource) {
            const yamlContent = yaml.dump(removeManagedFields(selectedResource));
            navigator.clipboard.writeText(yamlContent);
        }
    };

    const handleDownloadYaml = () => {
        if (selectedResource) {
            const yamlContent = yaml.dump(removeManagedFields(selectedResource));
            const blob = new Blob([yamlContent], { type: 'text/yaml;charset=utf-8' });
            const fileName = `${selectedResource.kind}-${selectedResource.metadata?.name}.yaml`;
            saveAs(blob, fileName);
        }
    };

    const getEventTypeChip = (type: string) => {
        return (
            <Chip
                label={type}
                size="small"
                color={type === 'Warning' ? 'secondary' : 'default'}
                variant={type === 'Warning' ? 'default' : 'outlined'}
            />
        );
    };

    const getRelativeTime = (timestamp: string) => {
        if (!timestamp) return 'Unknown';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return `${seconds}s ago`;
    };

    if (loading) {
        return <CircularProgress />;
    }

    if (!canShowResourceGraph) {
        return <Typography>You don't have permissions to view the resource graph</Typography>;
    }

    return (
        <ReactFlowProvider>
            <div style={{ height: '80vh' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodeClick={handleElementClick}
                    nodeTypes={nodeTypes}
                    style={{ width: '100%', height: '100%' }}
                >
                    <MiniMap
                        nodeColor={theme.palette.type === 'dark' ? '#fff' : '#000'}
                        nodeStrokeColor={theme.palette.type === 'dark' ? '#fff' : '#000'}
                        nodeBorderRadius={2}
                        style={{ backgroundColor: theme.palette.background.default }}
                    />
                    <Controls style={{ backgroundColor: theme.palette.background.default, color: theme.palette.text.primary }} />
                    <Background color={theme.palette.type === 'dark' ? '#fff' : '#000'} />
                </ReactFlow>
            </div>

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
                                {yaml.dump(removeManagedFields(selectedResource))}
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
        </ReactFlowProvider>
    );
};

export default CrossplaneResourceGraph;
