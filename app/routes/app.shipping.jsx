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
      `${r.cost} ${shopCurrency}`
    ) : (
      `${defaultRate} ${shopCurrency} (افتراضي)`
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
                  headings={["الدولة", "الولاية / الجهة", "المدينة", "المنطقة / الحي", "سعر الشحن"]}
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
                يمكنك تحميل أو تطبيق نماذج جاهزة لأسعار التوصيل بنقرة واحدة، أو لصق محتوى ملف CSV الخاص بشركات التوصيل لديك:
              </Text>

              <InlineStack gap="300">
                <Button
                  size="slim"
                  onClick={() => {
                    setCsvText(`Country_code,Region,City,Area,Rate_or_extra,Cost,Custom_rates
MA,Casablanca-Settat,الدار البيضاء,,rate,20,توصيل سريع:20|استلام من المكتب:15
MA,Casablanca-Settat,المحمدية,,rate,25,توصيل للمنزل:25
MA,Casablanca-Settat,سطات,,rate,30,توصيل للمنزل:30
MA,Casablanca-Settat,الجديدة,,rate,30,توصيل للمنزل:30
MA,Rabat-Sale-Kenitra,الرباط,,rate,25,توصيل سريع:25|استلام من المكتب:20
MA,Rabat-Sale-Kenitra,سلا,,rate,25,توصيل للمنزل:25
MA,Rabat-Sale-Kenitra,القنيطرة,,rate,30,توصيل للمنزل:30
MA,Marrakech-Safi,مراكش,,rate,30,توصيل سريع:30|استلام من المكتب:20
MA,Tanger-Tetouan-Al Hoceima,طنجة,,rate,30,توصيل سريع:30|استلام من المكتب:20
MA,Fes-Meknes,فاس,,rate,30,توصيل سريع:30|استلام من المكتب:20
MA,Souss-Massa,أكادير,,rate,35,توصيل سريع:35|استلام من المكتب:25
MA,Oriental,وجدة,,rate,35,توصيل للمنزل:35
MA,Sahara,العيون,,rate,45,توصيل للمنزل:45`);
                  }}
                >
                  🇲🇦 تحميل نموذج المغرب (Morocco Preset)
                </Button>

                <Button
                  size="slim"
                  onClick={() => {
                    setCsvText(`Country_code,Region,City,Area,Rate_or_extra,Cost,Custom_rates
DZ,16 Alger,,,rate,,توصيل للمنزل:400|استلام من المكتب Stop Desk:250
DZ,09 Blida,,,rate,,توصيل للمنزل:450|استلام من المكتب Stop Desk:250
DZ,31 Oran,,,rate,,توصيل للمنزل:500|استلام من المكتب Stop Desk:300
DZ,25 Constantine,,,rate,,توصيل للمنزل:500|استلام من المكتب Stop Desk:300
DZ,19 Setif,,,rate,,توصيل للمنزل:500|استلام من المكتب Stop Desk:300
DZ,15 Tizi Ouzou,,,rate,,توصيل للمنزل:500|استلام من المكتب Stop Desk:300
DZ,06 Bejaia,,,rate,,توصيل للمنزل:550|استلام من المكتب Stop Desk:350
DZ,13 Tlemcen,,,rate,,توصيل للمنزل:550|استلام من المكتب Stop Desk:350
DZ,23 Annaba,,,rate,,توصيل للمنزل:550|استلام من المكتب Stop Desk:350
DZ,35 Boumerdes,,,rate,,توصيل للمنزل:450|استلام من المكتب Stop Desk:250
DZ,42 Tipaza,,,rate,,توصيل للمنزل:450|استلام من المكتب Stop Desk:250
DZ,05 Batna,,,rate,,توصيل للمنزل:550|استلام من المكتب Stop Desk:350
DZ,07 Biskra,,,rate,,توصيل للمنزل:650|استلام من المكتب Stop Desk:450
DZ,30 Ouargla,,,rate,,توصيل للمنزل:750|استلام من المكتب Stop Desk:550
DZ,01 Adrar,,,rate,,توصيل للمنزل:950|استلام من المكتب Stop Desk:700`);
                  }}
                >
                  🇩🇿 تحميل نموذج الجزائر (Algeria Preset)
                </Button>
              </InlineStack>

              <TextField
                label="محتوى ملف الـ CSV"
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
