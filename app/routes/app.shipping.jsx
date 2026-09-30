import { useState } from "react";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { fetchWorker } from "../services/api.server";
import AppLayout from "../components/AppLayout";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  TextField,
  Checkbox,
  DataTable,
  Badge,
  Banner,
  Divider,
  Modal
} from "@shopify/polaris";

export async function loader({ request }) {
  try {
    const data = await fetchWorker(request, "/shipping/rates");
    return { ok: true, config: data.config || {} };
  } catch (err) {
    return { ok: false, error: err.message, config: {} };
  }
}

export async function action({ request }) {
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  try {
    if (actionType === "importShopify") {
      const result = await fetchWorker(request, "/shipping/import-shopify", {
        method: "POST"
      });
      return { ok: true, message: "تم استيراد أسعار ومناطق الشحن من شوبيفاي بنجاح!" };
    }

    if (actionType === "importCsv") {
      const csvContent = formData.get("csvContent");
      const result = await fetchWorker(request, "/shipping/import-csv", {
        method: "POST",
        body: JSON.stringify({ csvContent })
      });
      return { ok: true, message: `تم استيراد ${result.importedCount || 0} منطقة بنجاح من ملف الـ CSV!` };
    }

    if (actionType === "saveConfig") {
      const configJson = formData.get("configJson");
      const config = JSON.parse(configJson);
      await fetchWorker(request, "/shipping/save", {
        method: "POST",
        body: JSON.stringify({ config })
      });
      return { ok: true, message: "تم حفظ إعدادات الشحن بنجاح!" };
    }

    return { ok: false, error: "Unknown action" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default function ShippingManagerPage() {
  const { config, ok, error } = useLoaderData();
  const submit = useSubmit();
  const nav = useNavigation();
  const isLoading = nav.state === "submitting";

  const general = config.general || {
    enabled: true,
    defaultTitle: "توصيل سريع لجميع المدن",
    defaultRate: 30,
    freeShippingEnabled: true,
    freeShippingThreshold: 90800,
    freeShippingText: "مجاناً (توصيل سريع)"
  };

  const [enabled, setEnabled] = useState(general.enabled !== false);
  const [defaultTitle, setDefaultTitle] = useState(general.defaultTitle || "توصيل سريع لجميع المدن");
  const [defaultRate, setDefaultRate] = useState(String(general.defaultRate || 30));
  const [freeEnabled, setFreeEnabled] = useState(general.freeShippingEnabled !== false);
  const [freeThreshold, setFreeThreshold] = useState(String(general.freeShippingThreshold || 90800));
  const [freeText, setFreeText] = useState(general.freeShippingText || "مجاناً (توصيل سريع)");

  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const rates = config.rates || [];

  const handleSave = () => {
    const updatedConfig = {
      ...config,
      general: {
        ...general,
        enabled,
        defaultTitle,
        defaultRate: Number(defaultRate || 0),
        freeShippingEnabled: freeEnabled,
        freeShippingThreshold: Number(freeThreshold || 0),
        freeShippingText: freeText
      }
    };

    const fd = new FormData();
    fd.append("actionType", "saveConfig");
    fd.append("configJson", JSON.stringify(updatedConfig));
    submit(fd, { method: "POST" });
  };

  const handleImportShopify = () => {
    const fd = new FormData();
    fd.append("actionType", "importShopify");
    submit(fd, { method: "POST" });
  };

  const handleImportCsv = () => {
    if (!csvText.trim()) return;
    const fd = new FormData();
    fd.append("actionType", "importCsv");
    fd.append("csvContent", csvText);
    submit(fd, { method: "POST" });
    setCsvModalOpen(false);
    setCsvText("");
  };

  const filteredRates = rates.filter(r => {
    const q = searchQuery.toLowerCase();
    return (
      (r.countryCode || "").toLowerCase().includes(q) ||
      (r.region || "").toLowerCase().includes(q) ||
      (r.city || "").toLowerCase().includes(q) ||
      (r.area || "").toLowerCase().includes(q)
    );
  });

  const tableRows = filteredRates.map(r => [
    r.countryCode || "MA",
    r.region || "-",
    r.city || "-",
    r.area || "-",
    r.customRates ? (
      <Badge tone="info">{r.customRates}</Badge>
    ) : r.cost !== undefined ? (
      `${r.cost} MAD`
    ) : (
      `${defaultRate} MAD (افتراضي)`
    )
  ]);

  return (
    <AppLayout title="Shipping & Delivery" subtitle="Smart COD Delivery Engine, Custom Regional Rates & CSV Importer">
      <Page
        title="إدارة أسعار وطرق التوصيل (Shipping Engine)"
        primaryAction={{
          content: isLoading ? "جاري الحفظ..." : "حفظ التغييرات",
          onAction: handleSave,
          loading: isLoading
        }}
        secondaryActions={[
          {
            content: "استيراد من شوبيفاي (Import Shopify Zones)",
            onAction: handleImportShopify
          },
          {
            content: "استيراد ملف CSV (Upload CSV)",
            onAction: () => setCsvModalOpen(true)
          }
        ]}
      >
        <BlockStack gap="500">
          {error && <Banner tone="critical">{error}</Banner>}

          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">القواعد العامة للشحن (General Delivery Rules)</Text>
              <Text tone="subdued" as="p">
                حدد سعر التوصيل الافتراضي، وقواعد التوصيل المجاني وشريط التقدم (Free Shipping Progress Bar) لتشجيع العميل على زيادة قيمة الطلب.
              </Text>

              <Checkbox
                label="تفعيل نظام التوصيل في نموذج الدفع عند الاستلام"
                checked={enabled}
                onChange={setEnabled}
              />

              <InlineStack gap="400" wrap={false}>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="اسم خيار التوصيل الافتراضي"
                    value={defaultTitle}
                    onChange={setDefaultTitle}
                    autoComplete="off"
                    helpText="يظهر للعميل في النموذج وملخص الطلب (مثال: توصيل سريع لجميع المدن)"
                  />
                </div>
                <div style={{ width: "200px" }}>
                  <TextField
                    label="سعر الشحن الافتراضي (MAD)"
                    type="number"
                    value={defaultRate}
                    onChange={setDefaultRate}
                    autoComplete="off"
                  />
                </div>
              </InlineStack>

              <Divider />

              <Text variant="headingSm" as="h3">قاعدة الشحن المجاني (Free Shipping Threshold)</Text>

              <Checkbox
                label="تقديم شحن مجاني عند تخطي قيمة معينة للطلب"
                checked={freeEnabled}
                onChange={setFreeEnabled}
              />

              {freeEnabled && (
                <InlineStack gap="400" wrap={false}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="الحد الأدنى لقيمة السلة للشحن المجاني (MAD)"
                      type="number"
                      value={freeThreshold}
                      onChange={setFreeThreshold}
                      autoComplete="off"
                      helpText="إذا كان إجمالي السلة أكبر أو يساوي هذا المبلغ، يصبح الشحن 0.00 د.م تلقائياً"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="نص الشحن المجاني في الملخص"
                      value={freeText}
                      onChange={setFreeText}
                      autoComplete="off"
                    />
                  </div>
                </InlineStack>
              )}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <div>
                  <Text variant="headingMd" as="h2">أسعار التوصيل حسب المناطق والولايات ({rates.length})</Text>
                  <Text tone="subdued" as="p">
                    أسعار شحن مخصصة لكل ولاية أو مدينة أو مكتب توزيع (A Domicile / Stop Desk).
                  </Text>
                </div>
                <Button onClick={() => setCsvModalOpen(true)}>استيراد ملف CSV</Button>
              </InlineStack>

              <TextField
                placeholder="بحث في الولايات والمدن..."
                value={searchQuery}
                onChange={setSearchQuery}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setSearchQuery("")}
              />

              {tableRows.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["الدولة", "الولاية / الجهة", "المدينة", "المنطقة / الحي", "سعر الشحن"]}
                  rows={tableRows}
                />
              ) : (
                <Banner tone="info">
                  لا توجد أسعار مناطق مخصصة مسجلة حالياً. يتم تطبيق سعر الشحن الافتراضي ({defaultRate} MAD) أو الشحن المجاني فوق ({freeThreshold} MAD). يمكنك استيراد الأسعار من شوبيفاي أو رفع ملف CSV مثل Lightfunnels و Releasit.
                </Banner>
              )}
            </BlockStack>
          </Card>
        </BlockStack>

        {/* CSV Import Modal */}
        <Modal
          open={csvModalOpen}
          onClose={() => setCsvModalOpen(false)}
          title="استيراد أسعار التوصيل عبر ملف CSV"
          primaryAction={{
            content: "استيراد وتطبيق الأسعار",
            onAction: handleImportCsv,
            disabled: !csvText.trim()
          }}
          secondaryActions={[
            {
              content: "إلغاء",
              onAction: () => setCsvModalOpen(false)
            }
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p">
                الصق محتوى ملف الـ CSV لأسعار التوصيل أدناه. يجب أن يحتوي الملف على الأعمدة التالية كالمثال المعتمد:
              </Text>
              <Text as="pre" variant="bodySm" tone="subdued">
                {`Country_code,Region,City,Area,Rate_or_extra,Cost,Custom_rates
MA,Casablanca-Settat,Casablanca,,rate,25,
MA,Rabat-Sale-Kenitra,Rabat,,rate,30,
DZ,16 Alger,Bab El Oued,,rate,,Home:40|Desk:25`}
              </Text>
              <TextField
                label="محتوى الـ CSV"
                multiline={8}
                value={csvText}
                onChange={setCsvText}
                placeholder="Country_code,Region,City,Area,Rate_or_extra,Cost,Custom_rates..."
                autoComplete="off"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      </Page>
    </AppLayout>
  );
}
