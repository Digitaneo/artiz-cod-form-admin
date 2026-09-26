import AppLayout from "../components/AppLayout";
import { Page, Card, Text, BlockStack, Button } from "@shopify/polaris";

export default function SalesBoosterPage() {
  return (
    <AppLayout title="Sales Booster" subtitle="Upsells, Quantity Breaks & Offers Engine">
      <Page
        title="Sales Booster Engine"
        primaryAction={<Button variant="primary">Create Offer</Button>}
      >
        <BlockStack gap="400">
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Active Offers & Incentives</Text>
              <Text as="p" tone="subdued">
                Manage Quantity Breaks, In-Form Bundles, Urgency Countdown Timers, and One-Click Post Purchase Upsells.
              </Text>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </AppLayout>
  );
}
