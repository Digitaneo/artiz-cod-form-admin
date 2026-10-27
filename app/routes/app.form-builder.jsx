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
      discountBadgePrefix: "خصم",
      primaryColor: "#020a25",
      primaryHoverColor: "#0a1845",
      buttonTextColor: "#ffffff",
      secondaryColor: "#ffffff",
      secondaryHoverColor: "#f8fafc",
      secondaryTextColor: "#1e293b",
      secondaryBorderColor: "#cbd5e1",
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
      citiesList: "الدار البيضاء, الرباط, مراكش, فاس, طنجة, أكادير, الرياض, جدة, بغداد, أخرى"
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

    return { ok: true, message: "Configuration saved successfully and updated on storefront!" };
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
  const [discountBadgePrefix, setDiscountBadgePrefix] = useState(config.discountBadgePrefix || "خصم");

  // Root Colors
  const [primaryColor, setPrimaryColor] = useState(config.primaryColor || "#020a25");
  const [primaryHoverColor, setPrimaryHoverColor] = useState(config.primaryHoverColor || "#0a1845");
  const [buttonTextColor, setButtonTextColor] = useState(config.buttonTextColor || "#ffffff");
  const [secondaryColor, setSecondaryColor] = useState(config.secondaryColor || "#ffffff");
  const [secondaryHoverColor, setSecondaryHoverColor] = useState(config.secondaryHoverColor || "#f8fafc");
  const [secondaryTextColor, setSecondaryTextColor] = useState(config.secondaryTextColor || "#1e293b");
  const [secondaryBorderColor, setSecondaryBorderColor] = useState(config.secondaryBorderColor || "#cbd5e1");

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
    Array.isArray(config.citiesList) ? config.citiesList.join(", ") : (config.citiesList || "الدار البيضاء, الرباط, مراكش, فاس, طنجة, أكادير, الرياض, جدة, بغداد, أخرى")
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
      discountBadgePrefix,
      primaryColor,
      primaryHoverColor,
      buttonTextColor,
      secondaryColor,
      secondaryHoverColor,
      secondaryTextColor,
      secondaryBorderColor,
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
      title: "🪟 Popup Modal",
      badge: "Highest Conversion",
      badgeTone: "success",
      desc: "Modern modal centered with backdrop blur, immediately capturing shopper focus to complete the order."
    },
    {
      id: "slide_drawer",
      title: "📑 Slide Drawer",
      badge: "Smooth & Mobile",
      badgeTone: "info",
      desc: "Slides smoothly from the side of the screen, providing a native mobile app feel."
    },
    {
      id: "inline_form",
      title: "📦 Embedded Inline",
      badge: "Classic",
      badgeTone: "subdued",
      desc: "Directly embedded inside the product page beneath add-to-cart buttons without modal popups."
    },
    {
      id: "sticky_bar",
      title: "📱 Sticky Buy Bar",
      badge: "Mobile Optimized",
      badgeTone: "attention",
      desc: "Floats at the bottom of mobile screens while scrolling and expands checkout with a single tap."
    }
  ];

  return (
    <AppLayout title="Form Builder" subtitle="Custom Quick Order Checkout & Multi-Template Engine">
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
              title={saveFeedback.error ? "Save Error" : "Successfully Saved"}
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
                <Badge tone="success">Production Ready (v2.1.0)</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Full control over your quick order modal layout, customer fields, and tracking integrations.
              </Text>
              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={() => window.open(`https://admin.shopify.com/store/themes/current/editor?context=apps`, "_blank")}
                >
                  Open Theme Customizer & Activate App Embeds
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* 1. Choose Display Mode */}
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">1. Choose Display Mode</Text>
                <Text as="p" tone="subdued">
                  Select the visual presentation style displayed to customers when opening quick order:
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
                              {isSelected ? "✓ Active Selection" : "Activate Mode"}
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
              <Text variant="headingMd" as="h2">2. Customer Fields & Address Input Mode</Text>
              <Text as="p" tone="subdued">
                Configure required customer fields and select the optimal address input mode:
              </Text>

              <Select
                label="Address Input Mode"
                options={[
                  { label: "Standard Manual Address (Single flat shipping or free shipping thresholds)", value: "standard" },
                  { label: "Cascading Dropdowns: State / Province ──► City / Area (Custom regional shipping per city)", value: "cascading" }
                ]}
                value={addressMode}
                onChange={setAddressMode}
                helpText={
                  addressMode === "standard"
                    ? "Customer inputs their full address smoothly (City, District, Street). Applies unified shipping or free delivery threshold without distraction."
                    : "Customer selects their Province/State first, then cities dynamically appear (supports Algeria, Iraq, Morocco, and Saudi Arabia) with city-level shipping rates."
                }
              />

              <InlineStack gap="400">
                <Checkbox label="Full Name" checked={reqName} onChange={setReqName} />
                <Checkbox label="Phone Number" checked={reqPhone} onChange={setReqPhone} />
                {addressMode === "cascading" && (
                  <Checkbox label="State & City Dropdowns" checked={reqCity} onChange={setReqCity} />
                )}
                <Checkbox label="Detailed Street Address" checked={reqAddress} onChange={setReqAddress} />
                <Checkbox label="Delivery Note" checked={reqNote} onChange={setReqNote} />
              </InlineStack>
            </BlockStack>
          </Card>

          {/* 3. Conversion Boosters & Features */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">3. Conversion Boosters & Triggers</Text>
              <Text as="p" tone="subdued">
                Built-in conversion features to maximize order completion and tracking:
              </Text>
              <BlockStack gap="200">
                <Checkbox
                  label="Direct Buy Now from Product Page"
                  helpText="Clicking Buy Now opens the checkout form immediately with the selected variant without forcing cart redirect."
                  checked={directBuyTrigger}
                  onChange={setDirectBuyTrigger}
                />
                <Checkbox
                  label="Cart & Drawer Checkout Integration"
                  helpText="Displays the Quick Order button inside side cart drawers and the dedicated cart page."
                  checked={cartDrawerTrigger}
                  onChange={setCartDrawerTrigger}
                />
                <Checkbox
                  label="Live Cart Summary & Quantity Stepper (+/-)"
                  helpText="Allows customers to review line items, modify quantities, or remove items within the modal."
                  checked={enableCartSummary}
                  onChange={setEnableCartSummary}
                />
                <Checkbox
                  label="Discount & Coupon Code Field"
                  helpText="Enables promo coupon code input with instant price recalculation."
                  checked={enableDiscounts}
                  onChange={setEnableDiscounts}
                />
                <Checkbox
                  label="Affiliate Tracking Integration"
                  helpText="Seamlessly captures affiliate referral codes for GoAffPro, BixGrow, UpPromote, etc."
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
                <Text variant="headingMd" as="h2">4. Payment Gateways & Methods</Text>
                <Badge tone="info">Multi-Gateway Enabled</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Manage available payment methods within the quick checkout modal:
              </Text>

              <BlockStack gap="300">
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="bold">💵 Cash on Delivery (COD)</Text>
                      <Text variant="bodySm" tone="subdued">Pay in cash upon delivery at your doorstep. Order is created directly in Shopify.</Text>
                    </BlockStack>
                    <Checkbox label="Enabled" checked={enableCod} onChange={setEnableCod} />
                  </InlineStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodyMd" fontWeight="bold">💳 Electronic Payment - WAYL</Text>
                        <Badge tone="success">MasterCard / Visa / ZainCash / FIB / FastPay / Qi Card</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        Secure 3D-Secure payment gateway with automatic order payment status confirmation.
                      </Text>
                    </BlockStack>
                    <Checkbox label="Enabled" checked={enableWayl} onChange={setEnableWayl} />
                  </InlineStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="bodyMd" fontWeight="bold">💬 Direct WhatsApp Order</Text>
                          <Badge tone="attention">Instant Chat</Badge>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued">
                          Registers order in Shopify and initiates customer care WhatsApp chat with full order summary.
                        </Text>
                      </BlockStack>
                      <Checkbox label="Enabled" checked={enableWhatsapp} onChange={setEnableWhatsapp} />
                    </InlineStack>
                    {enableWhatsapp && (
                      <Box maxWidth="350px">
                        <TextField
                          label="Store WhatsApp Number (with country code, no +)"
                          placeholder="e.g. 9647700000000"
                          value={whatsappPhone}
                          onChange={setWhatsappPhone}
                          autoComplete="off"
                        />
                      </Box>
                    )}
                  </BlockStack>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>

          {/* 5. Branding & Colors (Root Palette) */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">5. Branding & Color System (Root Palette)</Text>
              <Text as="p" tone="subdued">
                Manage unified brand colors for primary and secondary action buttons, hover states, and borders:
              </Text>

              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h3">Primary Action Button (Buy Now / Quick Order)</Text>
                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                      <TextField
                        label="Background Color (Hex)"
                        value={primaryColor}
                        onChange={setPrimaryColor}
                        autoComplete="off"
                        helpText="Primary brand color (e.g. #020a25)"
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                      <TextField
                        label="Hover Background Color (Hex)"
                        value={primaryHoverColor}
                        onChange={setPrimaryHoverColor}
                        autoComplete="off"
                        helpText="Button hover state (e.g. #0a1845)"
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                      <TextField
                        label="Text & Icon Color (Hex)"
                        value={buttonTextColor}
                        onChange={setButtonTextColor}
                        autoComplete="off"
                        helpText="Primary button text (e.g. #ffffff)"
                      />
                    </Grid.Cell>
                  </Grid>
                </BlockStack>
              </Box>

              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h3">Secondary Action Button (Add to Cart)</Text>
                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <TextField
                        label="Background Color (Hex)"
                        value={secondaryColor}
                        onChange={setSecondaryColor}
                        autoComplete="off"
                        helpText="Add to Cart background (e.g. #ffffff)"
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <TextField
                        label="Hover Background (Hex)"
                        value={secondaryHoverColor}
                        onChange={setSecondaryHoverColor}
                        autoComplete="off"
                        helpText="Hover state (e.g. #f8fafc)"
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <TextField
                        label="Text Color (Hex)"
                        value={secondaryTextColor}
                        onChange={setSecondaryTextColor}
                        autoComplete="off"
                        helpText="Text color (e.g. #1e293b)"
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <TextField
                        label="Border Color (Hex)"
                        value={secondaryBorderColor}
                        onChange={setSecondaryBorderColor}
                        autoComplete="off"
                        helpText="Border color (e.g. #cbd5e1)"
                      />
                    </Grid.Cell>
                  </Grid>
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>

          {/* 6. Texts & Labels */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">6. Storefront Texts & Labels</Text>
              <Text as="p" tone="subdued">
                Customize button copy, form headings, and badge labels displayed to your storefront customers:
              </Text>
              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="Product Page Buy Button Text"
                    value={buttonText}
                    onChange={setButtonText}
                    autoComplete="off"
                    helpText="Appears on the primary Quick Order button (e.g. أطلب الآن / Buy Now)"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="Modal Submit Button Text"
                    value={submitButtonText}
                    onChange={setSubmitButtonText}
                    autoComplete="off"
                    helpText="Appears on the order confirmation button at bottom of modal"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="Form / Modal Header Title"
                    value={formTitle}
                    onChange={setFormTitle}
                    autoComplete="off"
                    helpText="Title shown at top of the order modal or drawer (e.g. معلومات الطلب)"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="Add To Cart Button Text"
                    value={addToCartButtonText}
                    onChange={setAddToCartButtonText}
                    autoComplete="off"
                    helpText="Text on the Add to Cart button next to Quick Order (e.g. أضف إلى السلة)"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="Cart Checkout Button Text"
                    value={cartCheckoutButtonText}
                    onChange={setCartCheckoutButtonText}
                    autoComplete="off"
                    helpText="Appears in slide cart drawers and cart page (e.g. إتمام الطلب)"
                  />
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <TextField
                    label="Discount Badge Prefix"
                    value={discountBadgePrefix}
                    onChange={setDiscountBadgePrefix}
                    autoComplete="off"
                    helpText="Single badge text prefix shown next to discounted prices (e.g. خصم or Save)"
                  />
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>

          {/* Save Action */}
          <Box paddingBlockEnd="600">
            <InlineStack align="end">
              <Button variant="primary" size="large" loading={isSaving} onClick={handleSave}>
                Save Configuration
              </Button>
            </InlineStack>
          </Box>
        </BlockStack>
      </Page>
    </AppLayout>
  );
}
