import AppLayout from "../components/AppLayout";
import { Page, Card, Text, BlockStack, Button, InlineStack, Badge, Grid } from "@shopify/polaris";

export default function BillingPage() {
  return (
    <AppLayout title="Billing" subtitle="SaaS Plan & Subscription Management">
      <Page title="Plans & Billing">
        <BlockStack gap="400">
          <Grid>
            <Grid.Cell columnSpan={{ xs: 12, sm: 4, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h3">Starter COD</Text>
                    <Badge tone="info">Active</Badge>
                  </InlineStack>
                  <Text variant="headingLg" as="p">$29 / month</Text>
                  <Text as="p" tone="subdued">Up to 300 orders/month, Form Builder & Fraud Shield.</Text>
                  <Button disabled>Current Plan</Button>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 12, sm: 4, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Growth COD OS</Text>
                  <Text variant="headingLg" as="p">$79 / month</Text>
                  <Text as="p" tone="subdued">Up to 2,000 orders/month, Delivery CRM & WhatsApp Bot.</Text>
                  <Button variant="primary">Upgrade to Growth</Button>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 12, sm: 4, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Enterprise Operating System</Text>
                  <Text variant="headingLg" as="p">$199 / month</Text>
                  <Text as="p" tone="subdued">Unlimited orders, Call Center CRM, Full Pixels & API.</Text>
                  <Button variant="primary">Upgrade to Enterprise</Button>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </BlockStack>
      </Page>
    </AppLayout>
  );
}
