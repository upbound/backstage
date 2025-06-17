import { Box, Typography } from '@material-ui/core';
import CrossplaneClaimResourcesTable from './CrossplaneClaimResourcesTable';
import CrossplaneCompositeResourcesTable from './CrossplaneCompositeResourcesTable';
import CrossplaneManagedResources from './CrossplaneManagedResources';
import CrossplaneUsedResourcesTable from './CrossplaneUsedResourcesTable';
const CrossplaneAllResourcesTable = () => {
    return (
        <Box>
            <Typography variant="h5" gutterBottom>
                Claim Resource
            </Typography>
            <CrossplaneClaimResourcesTable />

            <Typography variant="h5" gutterBottom style={{ marginTop: '2rem' }}>
                Composite Resource
            </Typography>
            <CrossplaneCompositeResourcesTable />

            <Typography variant="h5" gutterBottom style={{ marginTop: '2rem' }}>
                Managed Resources
            </Typography>
            <CrossplaneManagedResources />

            <Typography variant="h5" gutterBottom style={{ marginTop: '2rem' }}>
                Additional Crossplane Resources
            </Typography>
            <CrossplaneUsedResourcesTable />
        </Box>
    );
};

export default CrossplaneAllResourcesTable;
