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
  TextField,
  Checkbox,
  Banner,
  Box,
  Grid,
  Select
} from "@shopify/polaris";

export async function loader({ request }) {
  try {
    const data = await fetchWorker(request, "/settings");
    const formConfig = data.config?.settings?.formConfig || data.config?.formConfig || {
      displayMode: "popup_modal",
      buttonText: "أطلب الآن",
      submitButtonText: "إكمال الدفع",
      formTitle: "معلومات الطلب",
      addToCartButtonText: "أضف إلى السلة",
      cartCheckoutButtonText: "إتمام الطلب",
      primaryColor: "#020a25",
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
  const [buttonText, setButtonText] = useState(config.buttonText || "أطلب الآن");
  const [submitButtonText, setSubmitButtonText] = useState(config.submitButtonText || "إكمال الدفع");
  const [formTitle, setFormTitle] = useState(config.formTitle || "معلومات الطلب");
  const [addToCartButtonText, setAddToCartButtonText] = useState(config.addToCartButtonText || "أضف إلى السلة");
  const [cartCheckoutButtonText, setCartCheckoutButtonText] = useState(config.cartCheckoutButtonText || "إتمام الطلب");
  const [primaryColor, setPrimaryColor] = useState(config.primaryColor || "#020a25");
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
  const [addressMode, setAddressMode] = useState(config.addressMode || "standard");

  const [citiesList, setCitiesList] = useState(
    Array.isArray(config.citiesList) ? config.citiesList.join(", ") : (config.citiesList || "الدار البيضاء, الرباط, مراكش, فاس, طنجة, أكادير, مكناس, وجدة, أخرى")
  );

  const [enableCod, setEnableCod] = useState(config.paymentMethods?.methods?.cod?.enabled !== false);
  const [enableWayl, setEnableWayl] = useState(config.paymentMethods?.methods?.wayl?.enabled !== false);
  const [enableWhatsapp, setEnableWhatsapp] = useState(config.paymentMethods?.methods?.whatsapp?.enabled !== false);
  const [whatsappPhone, setWhatsappPhone] = useState(config.paymentMethods?.methods?.whatsapp?.phone || "9647700000000");

  const [saveFeedback, setSaveFeedback] = useState(null);

  useEffect(() => {
    if (actionData?.message) {
      setSaveFeedback({ message: actionData.message, error: false, timestamp: Date.now() });
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show(actionData.message);
      }
      const timer = setTimeout(() => setSaveFeedback(null), 4000);
      return () => clearTimeout(timer);
    } else if (actionData?.error) {
      setSaveFeedback({ message: actionData.error, error: true, timestamp: Date.now() });
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show(actionData.error, { isError: true });
      }
      const timer = setTimeout(() => setSaveFeedback(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);

  const handleSave = () => {
    setSaveFeedback(null);
    const payload = {
      ...config,
      displayMode,
      buttonText,
      submitButtonText,
      formTitle,
      addToCartButtonText,
      cartCheckoutButtonText,
      primaryColor,
      enableDiscounts,
      enableAffiliateTracking,
      enableCartSummary,
      directBuyTrigger,
      cartDrawerTrigger,
      addressMode,
      paymentMethods: {
        enabledMethods: [
          enableCod ? "cod" : null,
          enableWayl ? "wayl" : null,
          enableWhatsapp ? "whatsapp" : null
        ].filter(Boolean),
        defaultMethod: enableCod ? "cod" : (enableWayl ? "wayl" : "whatsapp"),
        methods: {
          cod: { enabled: enableCod, title: "الدفع عند الاستلام", subtitle: "💵 ادفع بكل أمان وقت استلام المنتج.", badge: "نقدي", icon: "cash" },
          wayl: { enabled: enableWayl, title: "دفع إلكتروني - WAYL", subtitle: "دفع آمن — SSL & 3D Secure", badge: "دفع آمن 100%", icon: "electronic", customDomain: "" },
          whatsapp: { enabled: false, title: "طلب مباشر عبر واتساب", subtitle: "تأكيد الطلب والتفاصيل مباشرة مع المتجر", badge: "تواصل سريع", icon: "whatsapp", phone: whatsappPhone }
        }
      },
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
          {saveFeedback && (
            <Banner
              key={saveFeedback.timestamp}
              tone={saveFeedback.error ? "critical" : "success"}
              title={saveFeedback.error ? "حدث خطأ أثناء الحفظ" : "تم الحفظ بنجاح"}
              onDismiss={() => setSaveFeedback(null)}
            >
              <Text as="p">{saveFeedback.message}</Text>
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
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">2. حقول بيانات العميل والشحن (Customer Fields & Address Mode)</Text>
              <Text as="p" tone="subdued">
                حدد الحقول المطلوبة من العميل ونمط إدخال العنوان الأنسب لسوقك المستهدف:
              </Text>

              <Select
                label="نمط إدخال العنوان واختيار المدينة (Address Input Mode)"
                options={[
                  { label: "نمط كلاسيكي عادي: كتابة العنوان يدوياً (مع نظام تسعير توصيل موحد)", value: "standard" },
                  { label: "قوائم منسدلة متتالية: الولاية / المحافظة ──► المدينة / القضاء (تسعير توصيل مخصص حسب كل مدينة)", value: "cascading" }
                ]}
                value={addressMode}
                onChange={setAddressMode}
                helpText={
                  addressMode === "standard"
                    ? "العميل يكتب عنوانه كاملاً بمرونة (المدينة، الحي، الشارع، رقم المنزل). يتم تطبيق سعر التوصيل الموحد أو التوصيل المجاني من القواعد العامة للشحن دون تشتيت العميل بقوائم منسدلة."
                    : "العميل يختار ولايته أو محافظته أولاً ثم تظهر له مدنها تلقائياً (دعم تلقائي لولايات الجزائر، محافظات العراق، وجهات المغرب) مع حساب أسعار الشحن المخصصة لكل مدينة."
                }
              />

              <InlineStack gap="400">
                <Checkbox label="الاسم الكامل (Full Name)" checked={reqName} onChange={setReqName} />
                <Checkbox label="رقم الهاتف (Phone Number)" checked={reqPhone} onChange={setReqPhone} />
                {addressMode === "cascading" && (
                  <Checkbox label="الولاية والمدينة (State & City Dropdowns)" checked={reqCity} onChange={setReqCity} />
                )}
                <Checkbox label="العنوان التفصيلي (Detailed Address)" checked={reqAddress} onChange={setReqAddress} />
                <Checkbox label="ملاحظات التوصيل (Delivery Note)" checked={reqNote} onChange={setReqNote} />
              </InlineStack>
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

          {/* 4. Payment Gateways & Methods */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">4. وسائل وبوابات الدفع (Payment Gateways & Methods)</Text>
                <Badge tone="info">نظام الدفع المتعدد</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                تحكم في وسائل الدفع المتاحة لعملائك داخل نافذة الطلب وتخصيص كل وسيلة بحرية:
              </Text>

              <BlockStack gap="300">
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="bold">💵 الدفع عند الاستلام (Cash on Delivery)</Text>
                      <Text variant="bodySm" tone="subdued">ادفع نقداً عند استلام شحنتك من المندوب. ينشئ الطلب فوراً في شوبيفاي.</Text>
                    </BlockStack>
                    <Checkbox label="مفعل" checked={enableCod} onChange={setEnableCod} />
                  </InlineStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodyMd" fontWeight="bold">💳 دفع إلكتروني - WAYL</Text>
                        <Badge tone="success">MasterCard / Visa / ZainCash / FIB / FastPay / Qi Card</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        تحويل آمن لبوابة الدفع وتأكيد الطلب وتحديث حالته إلى مدفوع آلياً فور إتمام العميل للدفع.
                      </Text>
                    </BlockStack>
                    <Checkbox label="مفعل" checked={enableWayl} onChange={setEnableWayl} />
                  </InlineStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="bodyMd" fontWeight="bold">💬 الطلب المباشر عبر واتساب (WhatsApp Order)</Text>
                          <Badge tone="attention">محادثة فورية</Badge>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued">
                          يسجل الطلب في شوبيفاي ويفتح نافذة محادثة واتساب موجهة لرقم خدمة العملاء مع ملخص الطلب كاملاً.
                        </Text>
                      </BlockStack>
                      <Checkbox label="مفعل" checked={enableWhatsapp} onChange={setEnableWhatsapp} />
                    </InlineStack>
                    {enableWhatsapp && (
                      <Box maxWidth="350px">
                        <TextField
                          label="رقم واتساب المتجر (مع مفتاح الدولة بدون +)"
                          placeholder="مثال: 9647700000000"
                          value={whatsappPhone}
                          onChange={setWhatsappPhone}
                          autoComplete="off"
                        />
                      </Box>
                    )}
                  </BlockStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodyMd" fontWeight="bold">🇸🇦 ادفع باي (Edfapay السعودية) & Network International</Text>
                        <Badge tone="subdued">قريباً / جاهز للتفعيل</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        مدى، أبل باي، بطاقات فيزا وماستركارد في السعودية والإمارات.
                      </Text>
                    </BlockStack>
                    <Badge tone="subdued">Scaffold Ready</Badge>
                  </InlineStack>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>

          {/* 5. Styling & Texts */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">5. نصوص وتسميات الأزرار والنموذج (Texts & Labels)</Text>
              <Text as="p" tone="subdued">
                تخصيص تسميات الأزرار وعناوين النموذج لتتناسب تماماً مع لغة وأسلوب متجرك وطرق الدفع المفعلة:
              </Text>
              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="نص زر الطلب في صفحة المنتج (Product Page Buy Button Text)"
                    value={buttonText}
                    onChange={setButtonText}
                    autoComplete="off"
                    helpText="يظهر على زر الطلب السريع الرئيسي بصفحة المنتج (مثال: أطلب الآن / اشتري الآن)"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="نص زر إكمال الطلب في النافذة (Modal Submit Button Text)"
                    value={submitButtonText}
                    onChange={setSubmitButtonText}
                    autoComplete="off"
                    helpText="يظهر على زر تأكيد الطلب النهائي أسفل النموذج (مثال: إكمال الدفع / تأكيد الطلب)"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="عنوان نافذة الطلب (Form / Modal Title)"
                    value={formTitle}
                    onChange={setFormTitle}
                    autoComplete="off"
                    helpText="يظهر كعنوان أعلى نافذة أو درج الطلب (مثال: معلومات الطلب / إتمام الشراء)"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="نص زر إضافة للسلة (Add To Cart Button Text)"
                    value={addToCartButtonText}
                    onChange={setAddToCartButtonText}
                    autoComplete="off"
                    helpText="يظهر على زر الإضافة للسلة بجانب زر الطلب السريع (مثال: أضف إلى السلة)"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="نص زر الدفع في السلة الجانبية (Cart Checkout Button Text)"
                    value={cartCheckoutButtonText}
                    onChange={setCartCheckoutButtonText}
                    autoComplete="off"
                    helpText="يظهر في السلة ودرج السلة Slide Cart Drawer (مثال: إتمام الطلب)"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="لون الزر الرئيسي (Primary Color Hex)"
                    value={primaryColor}
                    onChange={setPrimaryColor}
                    autoComplete="off"
                    helpText="كود لون الهوية الرئيسي للأزرار وعناصر التأكيد (مثال: #020a25)"
                  />
                </Grid.Cell>
              </Grid>
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
