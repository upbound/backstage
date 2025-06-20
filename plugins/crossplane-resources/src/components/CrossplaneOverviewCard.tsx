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
} from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import { KubernetesObject } from '@backstage/plugin-kubernetes';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { usePermission } from '@backstage/plugin-permission-react';
import { showOverview } from '@internal/plugin-crossplane-common-backend';
import { configApiRef } from '@backstage/core-plugin-api';
import { useNavigate } from 'react-router-dom';

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
    };
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
        cursor: 'pointer',
        '&:hover': {
            backgroundColor: theme.palette.action.hover,
        },
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
}));

const CrossplaneOverviewCard = () => {
    const { entity } = useEntity();
    const kubernetesApi = useApi(kubernetesApiRef);
    const config = useApi(configApiRef);
    const navigate = useNavigate();
    const enablePermissions = config.getOptionalBoolean('crossplane.enablePermissions') ?? false;
    const { allowed: canShowOverviewTemp } = usePermission({ permission: showOverview });
    const canShowOverview = enablePermissions ? canShowOverviewTemp : true;
    const [claim, setClaim] = useState<ExtendedKubernetesObject | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const classes = useStyles();

    useEffect(() => {
        if (!canShowOverview) {
            setLoading(false);
            return;
        }

        const fetchResources = async () => {
            const annotations = entity.metadata.annotations || {};
            const claimName = annotations['terasky.backstage.io/claim-name'];
            const plural = annotations['terasky.backstage.io/claim-plural'];
            const group = annotations['terasky.backstage.io/claim-group'];
            const version = annotations['terasky.backstage.io/claim-version'];
            const labelSelector = annotations['backstage.io/kubernetes-label-selector'];
            const namespace = labelSelector.split(',').find(s => s.startsWith('crossplane.io/claim-namespace'))?.split('=')[1];
            const clusterOfClaim = annotations['backstage.io/managed-by-location'].split(": ")[1];

            if (!plural || !group || !version || !namespace || !clusterOfClaim) {
                setLoading(false);
                return;
            }

            const resourceName = claimName;
            const url = `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${resourceName}`;

            try {
                const response = await kubernetesApi.proxy({
                    clusterName: clusterOfClaim,
                    path: url,
                    init: { method: 'GET' },
                });
                const claimResource: ExtendedKubernetesObject = await response.json();
                setClaim(claimResource);
            } catch (error) {
                console.error('Error fetching claim:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchResources();
    }, [kubernetesApi, entity, canShowOverview]);

    if (!canShowOverview) {
        return (
            <Card>
                <CardContent>
                    <Typography variant="h5" component="h1">
                        Claim (XRC)
                    </Typography>
                    <Box m={2}>
                        <Typography gutterBottom>
                            You don't have permissions to view claim resources
                        </Typography>
                    </Box>
                </CardContent>
            </Card>
        );
    }

    const getConditionStatus = (conditionType: string): { status: string; condition: any } => {
        const condition = claim?.status?.conditions?.find(c => c.type === conditionType);
        return {
            status: condition?.status || 'Unknown',
            condition: condition || {}
        };
    };

    const renderStatusBadge = (conditionType: string) => {
        const { status, condition } = getConditionStatus(conditionType);
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

    return (
        <Card>
            <CardContent>
                <Typography variant="h6" gutterBottom>
                    Claim (XRC)
                </Typography>

                {loading ? (
                    <Typography>Loading...</Typography>
                ) : claim ? (
                    <TableContainer component={Paper} className={classes.tableContainer}>
                        <Table className={classes.table} size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Name</TableCell>
                                    <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Namespace</TableCell>
                                    <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Group</TableCell>
                                    <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Kind</TableCell>
                                    <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Status</TableCell>
                                    <TableCell className={`${classes.tableCell} ${classes.headerCell}`}>Created</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                <TableRow
                                    className={classes.clickableRow}
                                    onClick={() => navigate(`/catalog/${entity.metadata.namespace}/component/${entity.metadata.name}/crossplane-resources`)}
                                >
                                    <TableCell className={classes.tableCell}>
                                        {claim.metadata?.name || 'Unknown'}
                                    </TableCell>
                                    <TableCell className={classes.tableCell}>
                                        {claim.metadata?.namespace || 'Unknown'}
                                    </TableCell>
                                    <TableCell className={classes.tableCell}>
                                        {claim.apiVersion?.split('/')[0] || 'Unknown'}
                                    </TableCell>
                                    <TableCell className={classes.tableCell}>
                                        {claim.kind || 'Unknown'}
                                    </TableCell>
                                    <TableCell className={classes.tableCell}>
                                        <Box display="flex">
                                            {renderStatusBadge('Synced')}
                                            {renderStatusBadge('Ready')}
                                        </Box>
                                    </TableCell>
                                    <TableCell className={classes.tableCell}>
                                        <Tooltip
                                            classes={{
                                                tooltip: classes.tooltip,
                                            }}
                                            title={formatDate(claim.metadata?.creationTimestamp)}
                                            arrow
                                        >
                                            <span style={{ cursor: 'help' }}>
                                                {getRelativeTime(claim.metadata?.creationTimestamp)}
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>
                ) : (
                    <Typography>No claim data available</Typography>
                )}
            </CardContent>
        </Card>
    );
};

export default CrossplaneOverviewCard;
