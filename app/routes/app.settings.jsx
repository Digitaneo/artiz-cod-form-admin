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
        throw new Error("يرجى إدخال محتوى ملف JSON للاستيراد.");
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonRaw);
      } catch (parseErr) {
        throw new Error("تنسيق JSON غير صالح: " + parseErr.message);
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
        message: "تم استيراد كافة المتغيرات والإعدادات بنجاح وتطبيقها على متجرك فورياً!"
      };
    }

    return { ok: false, error: "إجراء غير معروف" };
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
        title="إعدادات النظام والنسخ الاحتياطي (Settings & JSON Backup)"
        primaryAction={
          <Button variant="primary" onClick={handleExportJson}>
            تصدير ملف الإعدادات الكاملة (Export Full Configuration JSON)
          </Button>
        }
      >
        <BlockStack gap="400">
          {saveFeedback && (
            <Banner
              key={saveFeedback.timestamp}
              tone={saveFeedback.error ? "critical" : "success"}
              title={saveFeedback.error ? "حدث خطأ" : "تم بنجاح"}
              onDismiss={() => setSaveFeedback(null)}
            >
              <Text as="p">{saveFeedback.message}</Text>
            </Banner>
          )}

          {/* 1. Export Configuration */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">1. تصدير إعدادات المتجر (Export Full Configuration JSON)</Text>
                <Badge tone="success">نسخ احتياطي كامل</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                يمكنك تحميل ملف JSON يحتوي على كافة نصوص وأسماء الأزرار والمعرفات البرمجية، إعدادات الشحن، بوابات الدفع، وقواعد النموذج الخاصة بمتجرك.
              </Text>
              <InlineStack gap="300">
                <Button variant="primary" size="large" onClick={handleExportJson}>
                  💾 تحميل ملف الإعدادات (Download Configuration JSON)
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* 2. Import Configuration */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">2. استيراد وتطبيق الإعدادات (Import Configuration JSON)</Text>
                <Badge tone="attention">تحديث فوري</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                ارفع ملف JSON تم تصديره سابقاً أو الصق محتواه بالأسفل لتحديث كافة النصوص والمتغيرات والمعرفات وقواعد الشحن بضغطة زر واحدة:
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
                label="محتوى ملف JSON (JSON Configuration Content)"
                value={importJsonText}
                onChange={setImportJsonText}
                multiline={8}
                autoComplete="off"
                placeholder='الصق كود الـ JSON هنا أو اختر الملف أعلاه...'
                helpText="سيتم دمج وتطبيق كافة التسميات والمتغيرات المخزنة بالملف وحفظها مباشرة بقاعدة بيانات متجرك."
              />

              <InlineStack align="end">
                <Button
                  variant="primary"
                  loading={isSaving}
                  disabled={!importJsonText.trim()}
                  onClick={handleImportSubmit}
                >
                  استيراد وحفظ الإعدادات فورياً (Import & Apply JSON)
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* 3. Text Identifiers Cheatsheet */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">3. جدول معرفات النصوص والأزرار البرمجية (UI Text Identifiers Reference)</Text>
              <Text as="p" tone="subdued">
                الأكواد البرمجية والمنطق مفصولة تماماً عن مسميات الأزرار والنصوص. يمكنك تسمية وتغيير أي نص لأي لغة ترغب بها عبر هذه المعرفات:
              </Text>
              <Divider />
              <List type="bullet">
                <List.Item>
                  <code>buttonText</code>: نص زر الطلب السريع بصفحة المنتج (مثال: "أطلب الآن").
                </List.Item>
                <List.Item>
                  <code>submitButtonText</code>: نص زر إكمال وتأكيد الطلب أسفل النافذة أو الدرج (مثال: "إكمال الدفع" / "تأكيد الطلب").
                </List.Item>
                <List.Item>
                  <code>formTitle</code>: عنوان نافذة أو درج الطلب (مثال: "معلومات الطلب").
                </List.Item>
                <List.Item>
                  <code>addToCartButtonText</code>: نص زر الإضافة للسلة بصفحة المنتج (مثال: "أضف إلى السلة").
                </List.Item>
                <List.Item>
                  <code>addingToCartText</code>: نص زر السلة أثناء عملية الإضافة (مثال: "جاري الإضافة...").
                </List.Item>
                <List.Item>
                  <code>addedToCartText</code>: نص زر السلة بعد نجاح الإضافة (مثال: "✓ تمت الإضافة").
                </List.Item>
                <List.Item>
                  <code>cartCheckoutButtonText</code>: نص زر الدفع في السلة ودرج السلة (Cart Drawer) (مثال: "إتمام الطلب").
                </List.Item>
                <List.Item>
                  <code>submittingOrderText</code>: نص زر تأكيد الطلب أثناء التسجيل (مثال: "جاري تأكيد وتسجيل طلبك...").
                </List.Item>
                <List.Item>
                  <code>outOfStockText</code>: نص الأزرار عندما يكون المنتج أو المتغير غير متوفر (مثال: "غير متوفر").
                </List.Item>
                <List.Item>
                  <code>checkoutCartOnlyText</code>: نص زر الشراء عندما يكون المنتج الحالي غير متوفر ولكن السلة بها منتجات (مثال: "إتمام طلب السلة").
                </List.Item>
                <List.Item>
                  <code>emptyCartText</code>: نص الرسالة التوضيحية داخل النافذة عندما تكون السلة فارغة (مثال: "السلة فارغة").
                </List.Item>
              </List>
            </BlockStack>
          </Card>

          {/* 4. Active Live Config Preview */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">4. معاينة الإعدادات النشطة حالياً (Live Configuration Preview)</Text>
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