import { useLoaderData } from "react-router";
import { fetchWorker } from "../services/api.server";
import AppLayout from "../components/AppLayout";
import { Page, Card, Text, BlockStack, Grid } from "@shopify/polaris";

export async function loader({ request }) {
  try {
    const data = await fetchWorker(request, "/dashboard/summary");
    return { summary: data.summary || {}, ok: true };
  } catch (err) {
    return { ok: false, error: err.message, summary: {} };
  }
}

export default function AnalyticsPage() {
  const { summary } = useLoaderData();
  const stats = summary.stats || { orders: 0, revenue: 0 };

  return (
    <AppLayout title="Analytics" subtitle="COD Business Intelligence & Performance">
      <Page title="COD Business Intelligence">
        <BlockStack gap="400">
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Confirmation Rate</Text>
                  <Text variant="headingXl" as="p">0%</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">COD Success %</Text>
                  <Text variant="headingXl" as="p">0%</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Return Rate %</Text>
                  <Text variant="headingXl" as="p">0%</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Total Revenue</Text>
                  <Text variant="headingXl" as="p">${stats.revenue || 0}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </BlockStack>
      </Page>
    </AppLayout>
  );
}
