import { useLoaderData } from "react-router";
import { fetchWorker } from "../services/api.server";
import AppLayout from "../components/AppLayout";
import { Page, Card, Text, BlockStack, InlineStack, Badge, Button } from "@shopify/polaris";

export async function loader({ request }) {
  try {
    const data = await fetchWorker(request, "/orders");
    return { orders: data.orders || [], ok: true };
  } catch (err) {
    return { ok: false, error: err.message, orders: [] };
  }
}

export default function DeliverySuccessPage() {
  const { orders } = useLoaderData();

  return (
    <AppLayout title="Delivery Success" subtitle="COD Call Center & Order Pipeline CRM">
      <Page
        title="Delivery Success Pipeline"
        primaryAction={<Button variant="primary">Assign Agents</Button>}
      >
        <BlockStack gap="400">
          <InlineStack gap="300">
            <Badge tone="attention">New (0)</Badge>
            <Badge tone="warning">Pending Confirmation ({orders.length})</Badge>
            <Badge tone="info">Confirmed</Badge>
            <Badge tone="success">Shipped</Badge>
            <Badge tone="success">Delivered & Paid</Badge>
          </InlineStack>

          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Call Center Operations</Text>
              <Text as="p" tone="subdued">
                Manage call status (Confirmed, Cancelled, Busy, Rescheduled), track agent productivity, and send direct WhatsApp confirmation messages.
              </Text>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </AppLayout>
  );
}
