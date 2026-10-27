import { useState, useEffect } from "react";
import { useLoaderData, useActionData, useNavigation, useSubmit } from "react-router";
import { fetchWorker } from "../services/api.server";
import AppLayout from "../components/AppLayout";
import {
  Page,
  Card,
  Text,
  BlockStack,
  Button,
  InlineStack,
  Badge,
  Banner,
  Box,
  TextField,
  Divider,
  List
} from "@shopify/polaris";

export async function loader({ request }) {
  try {
    const data = await fetchWorker(request, "/settings");
    return {
      shop: data.config?.shop || "store",
      fullConfig: data.config?.settings || data.config || {},
      ok: true
    };
  } catch (err) {
    return { ok: false, error: err.message, fullConfig: {}, shop: "store" };
  }
}

export async function action({ request }) {
  try {
    const formData = await request.formData();
    const actionType = formData.get("actionType");

    if (actionType === "import_json") {
      const jsonRaw = formData.get("jsonContent");
      if (!jsonRaw) {
        throw new Error("Please enter JSON configuration content to import.");
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonRaw);
      } catch (parseErr) {
        throw new Error("Invalid JSON format: " + parseErr.message);
      }

      // Extract settings payload
      const settingsPayload = parsed.settings || parsed;

      await fetchWorker(request, "/settings/save", {
        method: "POST",
        body: JSON.stringify({
          settings: settingsPayload
        })
      });

      return {
        ok: true,
        message: "Configuration successfully imported and updated on storefront!"
      };
    }

    return { ok: false, error: "Unknown action" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default function SettingsPage() {
  const { shop, fullConfig } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSaving = navigation.state === "submitting";

  const [importJsonText, setImportJsonText] = useState("");
  const [saveFeedback, setSaveFeedback] = useState(null);

  useEffect(() => {
    if (actionData?.message) {
      setSaveFeedback({ message: actionData.message, error: false, timestamp: Date.now() });
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show(actionData.message);
      }
      setImportJsonText("");
      const timer = setTimeout(() => setSaveFeedback(null), 4000);
      return () => clearTimeout(timer);
    } else if (actionData?.error) {
      setSaveFeedback({ message: actionData.error, error: true, timestamp: Date.now() });
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show(actionData.error, { isError: true });
      }
    }
  }, [actionData]);

  // Export full configuration as downloadable JSON
  const handleExportJson = () => {
    const exportData = {
      exportVersion: "2.1.0",
      shop,
      exportedAt: new Date().toISOString(),
      settings: fullConfig
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `aladdin-quick-order-${shop}-config.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        setImportJsonText(content);
      }
    };
    reader.readAsText(file);
  };

  // Submit imported JSON
  const handleImportSubmit = () => {
    if (!importJsonText.trim()) return;
    const formData = new FormData();
    formData.append("actionType", "import_json");
    formData.append("jsonContent", importJsonText.trim());
    submit(formData, { method: "POST" });
  };

  return (
    <AppLayout title="Settings & JSON Backup" subtitle="Configuration Export/Import & Identifiers Engine">
      <Page
        title="Settings & JSON Backup"
        primaryAction={
          <Button variant="primary" onClick={handleExportJson}>
            Export Full Configuration JSON
          </Button>
        }
      >
        <BlockStack gap="400">
          {saveFeedback && (
            <Banner
              key={saveFeedback.timestamp}
              tone={saveFeedback.error ? "critical" : "success"}
              title={saveFeedback.error ? "Action Failed" : "Success"}
              onDismiss={() => setSaveFeedback(null)}
            >
              <Text as="p">{saveFeedback.message}</Text>
            </Banner>
          )}

          {/* 1. Export Configuration */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">1. Export Full Configuration (JSON Backup)</Text>
                <Badge tone="success">Complete Backup</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Download a complete JSON file containing all button copy, UI text variables, color schemes, shipping rules, and payment gateways for your store.
              </Text>
              <InlineStack gap="300">
                <Button variant="primary" size="large" onClick={handleExportJson}>
                  💾 Download Configuration JSON
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* 2. Import Configuration */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">2. Import Configuration JSON</Text>
                <Badge tone="attention">Instant Sync</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Upload a previously exported JSON backup or paste its contents below to update all labels, colors, and shipping rates instantly:
              </Text>

              <Box>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  style={{ marginBottom: "12px", display: "block" }}
                />
              </Box>

              <TextField
                label="JSON Configuration Content"
                value={importJsonText}
                onChange={setImportJsonText}
                multiline={8}
                autoComplete="off"
                placeholder="Paste JSON configuration content here or choose a file above..."
                helpText="All settings, custom labels, and rules from the JSON will be merged and saved directly into your store configuration."
              />

              <InlineStack align="end">
                <Button
                  variant="primary"
                  loading={isSaving}
                  disabled={!importJsonText.trim()}
                  onClick={handleImportSubmit}
                >
                  Import & Apply Configuration
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* 3. Text Identifiers Cheatsheet */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">3. UI Text Identifiers Reference</Text>
              <Text as="p" tone="subdued">
                Code logic is completely decoupled from customer-facing text copy. You can customize any label in any language via these identifiers:
              </Text>
              <Divider />
              <List type="bullet">
                <List.Item>
                  <code>buttonText</code>: Product page primary Quick Order button text (e.g. "أطلب الآن").
                </List.Item>
                <List.Item>
                  <code>submitButtonText</code>: Modal order confirmation button text (e.g. "إكمال الدفع" / "تأكيد الطلب").
                </List.Item>
                <List.Item>
                  <code>formTitle</code>: Form / Modal header title (e.g. "معلومات الطلب").
                </List.Item>
                <List.Item>
                  <code>addToCartButtonText</code>: Product page Add to Cart button text (e.g. "أضف إلى السلة").
                </List.Item>
                <List.Item>
                  <code>addingToCartText</code>: Text while adding item to cart (e.g. "جاري الإضافة...").
                </List.Item>
                <List.Item>
                  <code>addedToCartText</code>: Feedback text after successfully adding to cart (e.g. "✓ تمت الإضافة").
                </List.Item>
                <List.Item>
                  <code>cartCheckoutButtonText</code>: Button text in slide cart drawers and cart page (e.g. "إتمام الطلب").
                </List.Item>
                <List.Item>
                  <code>discountBadgePrefix</code>: Single badge prefix next to discounted items (e.g. "خصم").
                </List.Item>
                <List.Item>
                  <code>submittingOrderText</code>: Feedback text while order is being placed (e.g. "جاري تأكيد وتسجيل طلبك...").
                </List.Item>
                <List.Item>
                  <code>outOfStockText</code>: Button text when a product/variant is out of stock (e.g. "غير متوفر").
                </List.Item>
                <List.Item>
                  <code>emptyCartText</code>: Explanatory message when the shopping cart is empty (e.g. "السلة فارغة").
                </List.Item>
              </List>
            </BlockStack>
          </Card>

          {/* 4. Active Live Config Preview */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">4. Live Configuration Preview</Text>
              <Box
                padding="300"
                background="bg-surface-secondary"
                borderRadius="200"
                style={{ maxHeight: "350px", overflowY: "auto", fontFamily: "monospace", fontSize: "12px", direction: "ltr" }}
              >
                <pre>{JSON.stringify(fullConfig, null, 2)}</pre>
              </Box>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </AppLayout>
  );
}