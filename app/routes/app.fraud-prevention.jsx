import { useLoaderData } from "react-router";
import { fetchWorker } from "../services/api.server";
import AppLayout from "../components/AppLayout";
import { Page, Card, Text, BlockStack, InlineStack, Badge, Grid } from "@shopify/polaris";

export async function loader({ request }) {
  try {
    const data = await fetchWorker(request, "/system/status");
    return { status: data || {}, ok: true };
  } catch (err) {
    return { ok: false, error: err.message, status: {} };
  }
}

export default function FraudPreventionPage() {
  return (
    <AppLayout title="Fraud Prevention" subtitle="Risk Engine & Blacklist Management">
      <Page title="Fraud Prevention System">
        <BlockStack gap="400">
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Risk Score Engine</Text>
                  <Text variant="headingXl" as="p">0-100</Text>
                  <Badge tone="success">Active Protection</Badge>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Blocked Fake Orders</Text>
                  <Text variant="headingXl" as="p">0</Text>
                  <Text tone="subdued">Last 30 Days</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Blacklist Entries</Text>
                  <Text variant="headingXl" as="p">0 Phones</Text>
                  <Text tone="subdued">Global & Store Level</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>

          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Automated Risk Rules</Text>
              <Text as="p" tone="subdued">
                Configure duplicate order limits, fake name algorithms, and high-risk city restrictions.
              </Text>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </AppLayout>
  );
}
