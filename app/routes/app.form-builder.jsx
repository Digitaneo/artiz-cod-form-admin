import { useState } from "react";
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
  TextField,
  Checkbox,
  Banner,
  Box,
  Grid
} from "@shopify/polaris";

export async function loader({ request }) {
  try {
    const data = await fetchWorker(request, "/settings");
    const formConfig = data.config?.settings?.formConfig || data.config?.formConfig || {
      displayMode: "popup_modal",
      buttonText: "اشتري الآن - الدفع عند الاستلام",
      formTitle: "إتمام الطلب - الدفع عند الاستلام",
      primaryColor: "#008060",
      secondaryColor: "#ffffff",
      enableDiscounts: true,
      enableAffiliateTracking: true,
      enableCartSummary: true,
      directBuyTrigger: true,
      cartDrawerTrigger: true,
      requiredFields: {
        name: true,
        phone: true,
        city: true,
        address: true,
        note: false
      },
      citiesList: "الرياض, جدة, مكة المكرمة, المدينة المنورة, الدمام, أخرى"
    };

    return { config: formConfig, ok: true };
  } catch (err) {
    return { ok: false, error: err.message, config: {} };
  }
}

export async function action({ request }) {
  try {
    const formData = await request.formData();
    const configRaw = formData.get("formConfig");
    const formConfig = JSON.parse(configRaw);

    await fetchWorker(request, "/settings/save", {
      method: "POST",
      body: JSON.stringify({
        settings: {
          formConfig
        }
      })
    });

    return { ok: true, message: "تم حفظ إعدادات النموذج بنجاح وتحديث المتجر فورياً!" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default function FormBuilderPage() {
  const { config } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSaving = navigation.state === "submitting";

  // Form State
  const [displayMode, setDisplayMode] = useState(config.displayMode || "popup_modal");
  const [buttonText, setButtonText] = useState(config.buttonText || "اشتري الآن - الدفع عند الاستلام");
  const [formTitle, setFormTitle] = useState(config.formTitle || "إتمام الطلب - الدفع عند الاستلام");
  const [primaryColor, setPrimaryColor] = useState(config.primaryColor || "#008060");
  const [enableDiscounts, setEnableDiscounts] = useState(config.enableDiscounts !== false);
  const [enableAffiliateTracking, setEnableAffiliateTracking] = useState(config.enableAffiliateTracking !== false);
  const [enableCartSummary, setEnableCartSummary] = useState(config.enableCartSummary !== false);
  const [directBuyTrigger, setDirectBuyTrigger] = useState(config.directBuyTrigger !== false);
  const [cartDrawerTrigger, setCartDrawerTrigger] = useState(config.cartDrawerTrigger !== false);

  const [reqName, setReqName] = useState(config.requiredFields?.name !== false);
  const [reqPhone, setReqPhone] = useState(config.requiredFields?.phone !== false);
  const [reqCity, setReqCity] = useState(config.requiredFields?.city !== false);
  const [reqAddress, setReqAddress] = useState(config.requiredFields?.address !== false);
  const [reqNote, setReqNote] = useState(Boolean(config.requiredFields?.note));

  const [citiesList, setCitiesList] = useState(
    Array.isArray(config.citiesList) ? config.citiesList.join(", ") : (config.citiesList || "الرياض, جدة, مكة المكرمة, المدينة المنورة, الدمام, أخرى")
  );

  const handleSave = () => {
    const payload = {
      displayMode,
      buttonText,
      formTitle,
      primaryColor,
      enableDiscounts,
      enableAffiliateTracking,
      enableCartSummary,
      directBuyTrigger,
      cartDrawerTrigger,
      requiredFields: {
        name: reqName,
        phone: reqPhone,
        city: reqCity,
        address: reqAddress,
        note: reqNote
      },
      citiesList: citiesList.split(",").map(c => c.trim()).filter(Boolean)
    };

    const formData = new FormData();
    formData.append("formConfig", JSON.stringify(payload));
    submit(formData, { method: "POST" });
  };

  const modes = [
    {
      id: "popup_modal",
      title: "🪟 نافذة منبثقة (Popup Modal)",
      badge: "الأعلى تحويلاً",
      badgeTone: "success",
      desc: "نافذة عصرية تنبثق في منتصف الشاشة مع تعتيم الخلفية وتلفت انتباه العميل لإتمام الشراء فوراً."
    },
    {
      id: "slide_drawer",
      title: "📑 درج جانبي (Slide Drawer)",
      badge: "عصري وسلس",
      badgeTone: "info",
      desc: "ينزلق بنعومة من جانب الشاشة، متناسق جداً ومريح للعملاء على الهواتف الذكية."
    },
    {
      id: "inline_form",
      title: "📦 مدمج بالصفحة (Inline Form)",
      badge: "كلاسيكي",
      badgeTone: "subdued",
      desc: "يظهر كنموذج ثابت داخل صفحة المنتج تحت أزرار الشراء مباشرة دون أي نوافذ منبثقة."
    },
    {
      id: "sticky_bar",
      title: "📱 شريط عائم (Sticky Buy Bar)",
      badge: "خاص بالجوال",
      badgeTone: "attention",
      desc: "شريط شراء عائم ومثبت أسفل شاشة الهاتف يظهر أثناء تصفح العميل للمنتج ويفتح النموذج بضغطة واحدة."
    }
  ];

  return (
    <AppLayout title="Form Builder" subtitle="Custom COD Checkout & Multi-Template Engine">
      <Page
        title="Form Builder & Multi-Template Settings"
        primaryAction={
          <Button variant="primary" loading={isSaving} onClick={handleSave}>
            Save Configuration
          </Button>
        }
      >
        <BlockStack gap="400">
          {actionData?.message && (
            <Banner tone="success" title="تم الحفظ بنجاح">
              <Text as="p">{actionData.message}</Text>
            </Banner>
          )}

          {actionData?.error && (
            <Banner tone="critical" title="حدث خطأ أثناء الحفظ">
              <Text as="p">{actionData.error}</Text>
            </Banner>
          )}

          {/* Theme Status & Quick Install */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Shopify Theme App Extension Status</Text>
                <Badge tone="success">Production Ready (v2.0.0)</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                تحكم كامل في شكل ونموذج الدفع عند الاستلام وحقول العميل وتتبع المسوقين وعمولاتهم.
              </Text>
              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={() => window.open(`https://admin.shopify.com/store/themes/current/editor?context=apps`, "_blank")}
                >
                  فتح محرر الثيم وتفعيل App Embeds
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* 1. Choose Display Mode */}
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">1. اختر نموذج وشكل العرض (Display Mode)</Text>
                <Text as="p" tone="subdued">
                  اختر الشكل الذي يفضله متجرك ليظهر للعميل عند النقر على الدفع عند الاستلام:
                </Text>
              </BlockStack>

              <Grid>
                {modes.map((mode) => {
                  const isSelected = displayMode === mode.id;
                  return (
                    <Grid.Cell key={mode.id} columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                      <Box
                        padding="400"
                        borderWidth="025"
                        borderColor={isSelected ? "border-brand" : "border"}
                        borderRadius="300"
                        background={isSelected ? "bg-surface-selected" : "bg-surface"}
                        onClick={() => setDisplayMode(mode.id)}
                        style={{ cursor: "pointer", transition: "all 0.2s ease" }}
                      >
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text variant="headingSm" as="h3">{mode.title}</Text>
                            <Badge tone={mode.badgeTone}>{mode.badge}</Badge>
                          </InlineStack>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {mode.desc}
                          </Text>
                          <InlineStack align="end">
                            <Button
                              size="micro"
                              variant={isSelected ? "primary" : "secondary"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDisplayMode(mode.id);
                              }}
                            >
                              {isSelected ? "✓ تم الاختيار" : "تفعيل هذا النموذج"}
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    </Grid.Cell>
                  );
                })}
              </Grid>
            </BlockStack>
          </Card>

          {/* 2. Customer Fields Config */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">2. حقول بيانات العميل والشحن (Customer Fields)</Text>
              <Text as="p" tone="subdued">
                حدد الحقول التي تطلبها من العميل عند تأكيد طلب الدفع عند الاستلام:
              </Text>
              <InlineStack gap="400">
                <Checkbox label="الاسم الكامل (Full Name)" checked={reqName} onChange={setReqName} />
                <Checkbox label="رقم الهاتف (Phone Number)" checked={reqPhone} onChange={setReqPhone} />
                <Checkbox label="المدينة / المنطقة (City / Region)" checked={reqCity} onChange={setReqCity} />
                <Checkbox label="العنوان التفصيلي (Detailed Address)" checked={reqAddress} onChange={setReqAddress} />
                <Checkbox label="ملاحظات التوصيل (Delivery Note)" checked={reqNote} onChange={setReqNote} />
              </InlineStack>
              <Box paddingBlockStart="200">
                <TextField
                  label="قائمة المدن المدعومة (افصل بينها بفاصلة ,)"
                  value={citiesList}
                  onChange={setCitiesList}
                  autoComplete="off"
                  helpText="ستظهر هذه المدن كخيارات سريعة للعميل لتسهيل وتسريع عملية الطلب."
                />
              </Box>
            </BlockStack>
          </Card>

          {/* 3. Features & Conversion Boosters */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">3. ميزات تعزيز المبيعات والتحويلات (Conversion & Tracking)</Text>
              <Text as="p" tone="subdued">
                أدوات ذكية مدمجة لرفع نسبة التحويل وتتبع العمولات وحساب الخصومات:
              </Text>
              <BlockStack gap="200">
                <Checkbox
                  label="تفعيل شراء المنتج المباشر من صفحته (Direct Buy Now)"
                  helpText="عند النقر على الزر في صفحة المنتج، يتم فتح النموذج فوراً بالمنتج المختار دون إجبار العميل على الذهاب للسلة."
                  checked={directBuyTrigger}
                  onChange={setDirectBuyTrigger}
                />
                <Checkbox
                  label="تفعيل زر الدفع في السلة (Cart Checkout Integration)"
                  helpText="إظهار ملخص كامل للمنتجات الموجودة في السلة وإمكانية زيادة أو إنقاص الكمية داخل النافذة."
                  checked={cartDrawerTrigger}
                  onChange={setCartDrawerTrigger}
                />
                <Checkbox
                  label="إظهار ملخص المنتجات والكميات (+/-) داخل النافذة (Cart Summary)"
                  helpText="يسمح للعميل بمشاهدة صور المنتجات، تعديل كمياتها أو حذف منتج بسهولة داخل النافذة."
                  checked={enableCartSummary}
                  onChange={setEnableCartSummary}
                />
                <Checkbox
                  label="تفعيل خانة كوبونات الخصم (Discount Coupons)"
                  helpText="إتاحة حقل إدخال كود الخصم داخل النافذة مع عكس الخصم فوراً."
                  checked={enableDiscounts}
                  onChange={setEnableDiscounts}
                />
                <Checkbox
                  label="تتبع برامج الإحالة والمسوقين تلقائياً (Affiliate Tracking Integration)"
                  helpText="يدعم تطبيقات GoAffPro, BixGrow, UpPromote وغيرها بحقن كود المسوق في الطلب لاحتساب العمولات تلقائياً."
                  checked={enableAffiliateTracking}
                  onChange={setEnableAffiliateTracking}
                />
              </BlockStack>
            </BlockStack>
          </Card>

          {/* 4. Styling & Texts */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">4. نصوص وألوان النموذج (Texts & Colors)</Text>
              <InlineStack gap="400">
                <Box minWidth="300px">
                  <TextField
                    label="نص زر الطلب الرئيسي (Button Text)"
                    value={buttonText}
                    onChange={setButtonText}
                    autoComplete="off"
                  />
                </Box>
                <Box minWidth="300px">
                  <TextField
                    label="عنوان النموذج (Form Title)"
                    value={formTitle}
                    onChange={setFormTitle}
                    autoComplete="off"
                  />
                </Box>
                <Box minWidth="200px">
                  <TextField
                    label="لون الزر الرئيسي (Primary Color Hex)"
                    value={primaryColor}
                    onChange={setPrimaryColor}
                    autoComplete="off"
                  />
                </Box>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Save Action */}
          <Box paddingBlockEnd="600">
            <InlineStack align="end">
              <Button variant="primary" size="large" loading={isSaving} onClick={handleSave}>
                حفظ كافة الإعدادات (Save Configuration)
              </Button>
            </InlineStack>
          </Box>
        </BlockStack>
      </Page>
    </AppLayout>
  );
}
