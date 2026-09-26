import { Grid } from "@shopify/polaris";
import DashboardCard from "./DashboardCard";

export default function DashboardCards({ stats }) {
  return (
    <Grid>

      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
        <DashboardCard
          title="Orders"
          value={stats.orders}
        />
      </Grid.Cell>

      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
        <DashboardCard
          title="Revenue"
          value={`$${stats.revenue}`}
        />
      </Grid.Cell>

      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
        <DashboardCard
          title="Customers"
          value={stats.customers}
        />
      </Grid.Cell>

      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
        <DashboardCard
          title="Products"
          value={stats.products}
        />
      </Grid.Cell>

    </Grid>
  );
}