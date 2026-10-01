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
import { MOROCCO_SHIPPING_PRESET, IRAQ_SHIPPING_PRESET, ALGERIA_SHIPPING_PRESET } from "../data/shipping-presets";

export async function loader({ request }) {
  try {
    const data = await fetchWorker(request, "/shipping/rates");
    const config = data.data?.config || data.config || {};
    const shopCurrency = data.data?.shopCurrency || data.shopCurrency || "MAD";
    return { ok: true, config, shopCurrency };
  } catch (err) {
    return { ok: false, error: err.message, config: {}, shopCurrency: "MAD" };
  }
}

export async function action({ request }) {
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  try {
    if (actionType === "importShopify") {
      await fetchWorker(request, "/shipping/import-shopify", {
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
      const count = result.data?.importedCount !== undefined ? result.data.importedCount : (result.importedCount || 0);
      return { ok: true, message: `تم استيراد ${count} منطقة بنجاح من ملف الـ CSV!` };
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
  const { config, shopCurrency = "MAD", ok, error } = useLoaderData();
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
  const [presetNotice, setPresetNotice] = useState("");

  const [rates, setRates] = useState(config.rates || []);

  const handleApplyMoroccoPreset = () => {
    setRates(MOROCCO_SHIPPING_PRESET);
    setDefaultRate("35");
    setDefaultTitle("توصيل سريع لجميع المدن المغربية");
    setPresetNotice(`تم تحميل نموذج أسعار المغرب بنجاح (${MOROCCO_SHIPPING_PRESET.length} مدينة وإقليم)! يرجى النقر على 'حفظ التغييرات' بالجهة العليا لاعتمادها.`);
  };

  const handleApplyIraqPreset = () => {
    setRates(IRAQ_SHIPPING_PRESET);
    setDefaultRate("5000");
    setDefaultTitle("توصيل سريع لجميع محافظات العراق");
    setPresetNotice(`تم تحميل نموذج أسعار العراق بنجاح (${IRAQ_SHIPPING_PRESET.length} قضاء ومحافظة)! يرجى النقر على 'حفظ التغييرات' بالجهة العليا لاعتمادها.`);
  };

  const handleApplyAlgeriaPreset = () => {
    setRates(ALGERIA_SHIPPING_PRESET);
    setDefaultRate("600");
    setDefaultTitle("توصيل سريع لجميع الولايات الجزائرية");
    setPresetNotice(`تم تحميل نموذج أسعار الجزائر بنجاح (${ALGERIA_SHIPPING_PRESET.length} ولاية وبلدية)! يرجى النقر على 'حفظ التغييرات' بالجهة العليا لاعتمادها.`);
  };

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
      },
      rates
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
      (r.deliveryMethod || r.area || "").toLowerCase().includes(q) ||
      (r.customRates || "").toLowerCase().includes(q)
    );
  });

  const tableRows = filteredRates.map(r => {
    // Delivery Method column rendering
    let methodCell = <Badge tone="subdued">🚚 توصيل موحد / قياسي</Badge>;
    if (r.customRates && String(r.customRates).includes(":")) {
      const parts = String(r.customRates).split("|").map(p => p.split(":")[0]?.trim());
      methodCell = (
        <InlineStack gap="100" wrap>
          {parts.map((p, idx) => (
            <Badge key={idx} tone="info">
              {p.includes("مكتب") || p.toLowerCase().includes("desk") ? `🏢 ${p}` : `🏠 ${p}`}
            </Badge>
          ))}
        </InlineStack>
      );
    } else {
      const m = (r.deliveryMethod || r.area || "").trim();
      if (m && m !== "-") {
        const isDesk = m.includes("مكتب") || m.toLowerCase().includes("desk");
        methodCell = (
          <Badge tone={isDesk ? "attention" : "success"}>
            {isDesk ? `🏢 ${m}` : `🏠 ${m}`}
          </Badge>
        );
      }
    }

    // Cost column rendering
    let costCell = `${defaultRate} ${shopCurrency} (افتراضي)`;
    if (r.customRates && String(r.customRates).includes(":")) {
      const parts = String(r.customRates).split("|");
      costCell = (
        <InlineStack gap="100" wrap>
          {parts.map((p, idx) => {
            const [name, price] = p.split(":");
            return (
              <Badge key={idx} tone="success">
                {`${name?.trim()}: ${price?.trim()} ${shopCurrency}`}
              </Badge>
            );
          })}
        </InlineStack>
      );
    } else if (r.cost !== undefined && r.cost !== null) {
      costCell = `${r.cost} ${shopCurrency}`;
    }

    return [
      r.countryCode || "MA",
      r.region || "-",
      r.city || "-",
      methodCell,
      costCell
    ];
  });

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
                    label={`سعر الشحن الافتراضي (${shopCurrency})`}
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
                      label={`الحد الأدنى لقيمة السلة للشحن المجاني (${shopCurrency})`}
                      type="number"
                      value={freeThreshold}
                      onChange={setFreeThreshold}
                      autoComplete="off"
                      helpText={`إذا كان إجمالي السلة أكبر أو يساوي هذا المبلغ، يصبح الشحن 0.00 ${shopCurrency} تلقائياً`}
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

              {presetNotice && (
                <Banner tone="success" onDismiss={() => setPresetNotice("")}>
                  {presetNotice}
                </Banner>
              )}

              {/* Quick Country Presets */}
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued">
                  نماذج سريعة جاهزة لأسعار التوصيل (انقر لتحميل جميع المدن والأسعار التجريبية):
                </Text>
                <InlineStack gap="200" wrap>
                  <Button size="slim" onClick={handleApplyMoroccoPreset}>
                    🇲🇦 تطبيق نموذج أسعار المغرب (60+ مدينة)
                  </Button>
                  <Button size="slim" onClick={handleApplyAlgeriaPreset}>
                    🇩🇿 تطبيق نموذج أسعار الجزائر (58 ولاية)
                  </Button>
                  <Button size="slim" onClick={handleApplyIraqPreset}>
                    🇮🇶 تطبيق نموذج أسعار العراق (18 محافظة)
                  </Button>
                </InlineStack>
              </BlockStack>

              <Divider />

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
                  headings={["الدولة", "الولاية / الجهة", "المدينة", "طريقة الاستلام / نوع التوصيل", "سعر الشحن"]}
                  rows={tableRows}
                />
              ) : (
                <Banner tone="info">
                  {`لا توجد أسعار مناطق مخصصة مسجلة حالياً. يتم تطبيق سعر الشحن الافتراضي (${defaultRate} ${shopCurrency}) أو الشحن المجاني فوق (${freeThreshold} ${shopCurrency}). يمكنك استيراد الأسعار من شوبيفاي أو رفع ملف CSV مثل Lightfunnels و Releasit.`}
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
            <BlockStack gap="400">
              <Text as="p">
                نموذج إرشادي جاهز لأسعار جهة الدار البيضاء ومدنها وفق معيار النظام. يمكنك نسخه وتعديل أسماء المدن والمحافظات أو رمز الدولة (مثلاً <code>LY</code> لليبيا أو <code>DZ</code> للجزائر) بكل سهولة:
              </Text>

              <InlineStack gap="300">
                <Button
                  size="slim"
                  onClick={() => {
                    setCsvText(`Country_code,Region,City,Delivery_method,Rate_or_extra,Cost,Custom_rates
MA,جهة الدار البيضاء - سطات,الدار البيضاء,توصيل للمنزل / استلام مكتب,rate,,توصيل للمنزل:35|استلام من المكتب (Stop Desk):25
MA,جهة الدار البيضاء - سطات,المحمدية,توصيل للمنزل / استلام مكتب,rate,,توصيل للمنزل:35|استلام من المكتب (Stop Desk):25
MA,جهة الدار البيضاء - سطات,مديونة,توصيل للمنزل,rate,25,
MA,جهة الدار البيضاء - سطات,النواصر,توصيل للمنزل,rate,25,
MA,جهة الدار البيضاء - سطات,الدروة,توصيل للمنزل,rate,25,
MA,جهة الدار البيضاء - سطات,بوزنيقة,توصيل للمنزل,rate,30,
MA,جهة الدار البيضاء - سطات,حد السوالم,توصيل للمنزل,rate,30,
MA,جهة الدار البيضاء - سطات,برشيد,توصيل للمنزل,rate,35,
MA,جهة الدار البيضاء - سطات,سطات,توصيل للمنزل,rate,35,
MA,جهة الدار البيضاء - سطات,الجديدة,توصيل للمنزل,rate,35,
MA,جهة الدار البيضاء - سطات,بنسليمان,توصيل للمنزل,rate,35,
MA,جهة الدار البيضاء - سطات,سيدي بنور,توصيل للمنزل,rate,40,`);
                  }}
                >
                  📋 تحميل نموذج جهة الدار البيضاء ومدنها (نموذج إرشادي جاهز للتعديل)
                </Button>
              </InlineStack>

              <TextField
                label="محتوى ملف الـ CSV"
                multiline={9}
                value={csvText}
                onChange={setCsvText}
                placeholder="Country_code,Region,City,Delivery_method,Rate_or_extra,Cost,Custom_rates..."
                autoComplete="off"
                helpText="يمكن لأي متجر (في ليبيا أو الجزائر أو العراق أو غيرها) نسخ هذا النموذج وتعديل رمز الدولة والمحافظات والمدن وطرق التوصيل ثم استيراده بنقرة واحدة."
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      </Page>
    </AppLayout>
  );
}
