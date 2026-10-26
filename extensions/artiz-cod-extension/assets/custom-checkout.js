/**
 * Artiz COD Form Engine - Storefront Client v2.1.0
 * Features:
 * - Smart Cart Sync with accurate Shopify discounts, original price strikethrough, and savings badges.
 * - Dynamic Shipping Engine with Free Shipping threshold progress bar & Stop Desk / Home delivery methods.
 * - Cascading Location Dropdowns (Region/Wilaya -> City/Baladiya) for Morocco, Algeria, and Saudi Arabia.
 * - Instant Direct Buy & Cart Drawer triggers.
 * - Multi-store isolated configuration.
 */
(function () {
  "use strict";

  const WORKER_URL = "https://aladdin-quick-order.digitaneo.workers.dev";
  let activeConfig = null;
  let activeShippingConfig = null;
  let orderItems = []; // [{ variantId, title, variantTitle, price, originalPrice, discountAmount, discountTitle, image, quantity }]
  let currentShop = "";
  let appliedDiscount = null;
  let loggedCustomer = null;
  let storeCurrency = "MAD";
  let storeMoneyFormat = "";
  let storeMoneyWithCurrencyFormat = "";
  let selectedShippingMethod = null;
  let currentCalculatedShipping = { cost: 0, title: "توصيل سريع لجميع المدن", isFree: false };
  let activePaymentConfig = null;
  let selectedPaymentMethod = "cod";
  const productDetailCache = {};

  // Instant zero-flash mode initialization from cache
  try {
    const cachedMode = localStorage.getItem("artiz_button_mode");
    if (cachedMode === "hijack") {
      document.documentElement.classList.add("artiz-hijack-mode");
      if (document.body) document.body.classList.add("artiz-hijack-mode");
    }
  } catch (_) { }

  function formatMoney(amount) {
    const num = Number(amount || 0);

    // 1. If explicit Shopify money format template is provided by store
    if (storeMoneyFormat) {
      if (storeMoneyFormat.includes("{{amount_no_decimals}}")) {
        const formatted = Math.round(num).toLocaleString("en-US", { maximumFractionDigits: 0 });
        return storeMoneyFormat.replace(/\{\{\s*amount_no_decimals\s*\}\}/g, formatted);
      }
      if (storeMoneyFormat.includes("{{amount_no_decimals_with_comma_separator}}")) {
        const formatted = Math.round(num).toLocaleString("de-DE", { maximumFractionDigits: 0 });
        return storeMoneyFormat.replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/g, formatted);
      }
      if (storeMoneyFormat.includes("{{amount_no_decimals_with_space_separator}}")) {
        const formatted = Math.round(num).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
        return storeMoneyFormat.replace(/\{\{\s*amount_no_decimals_with_space_separator\s*\}\}/g, formatted);
      }
      if (storeMoneyFormat.includes("{{amount_with_comma_separator}}")) {
        const formatted = num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return storeMoneyFormat.replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, formatted);
      }
      if (storeMoneyFormat.includes("{{amount_with_apostrophe_separator}}")) {
        const formatted = num.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return storeMoneyFormat.replace(/\{\{\s*amount_with_apostrophe_separator\s*\}\}/g, formatted);
      }
      if (storeMoneyFormat.includes("{{amount}}")) {
        const formatted = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return storeMoneyFormat.replace(/\{\{\s*amount\s*\}\}/g, formatted);
      }
    }

    // 2. Currencies that naturally never use decimals or integer amounts in non-decimal stores
    const zeroDecimalCurrencies = ["IQD", "JPY", "KRW", "CLP", "VND", "PYG", "RWF", "UGX", "BIF", "DJF", "GNF", "KMF", "VUV", "XAF", "XOF", "XPF"];
    const currUpper = String(storeCurrency || "").toUpperCase();
    const isZeroDecimal = zeroDecimalCurrencies.includes(currUpper);

    if (isZeroDecimal || Number.isInteger(num)) {
      const formattedNum = Math.round(num).toLocaleString("en-US", { maximumFractionDigits: 0 });
      const symbolOrCode = currUpper === "IQD" ? "د.ع" : storeCurrency;
      return `${formattedNum} ${symbolOrCode}`;
    }

    // 3. General standard currency fallback
    const formattedDec = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${formattedDec} ${storeCurrency}`;
  }

  // Regional Locations & Datasets (Loaded modularly per country via window.ARTIZ_LOCATIONS)
  window.ARTIZ_LOCATIONS = window.ARTIZ_LOCATIONS || {};

  const REGIONAL_DATASETS = new Proxy({}, {
    get: function (target, prop) {
      if (window.ARTIZ_LOCATIONS && window.ARTIZ_LOCATIONS[prop]) {
        return window.ARTIZ_LOCATIONS[prop];
      }
      const firstAvailable = Object.values(window.ARTIZ_LOCATIONS || {})[0];
      return firstAvailable || { name: "", currency: "MAD", defaultRegion: "", regions: {}, aliases: {} };
    }
  });

  async function ensureCountryLocationsLoaded(countryCode) {
    if (window.ARTIZ_LOCATIONS && window.ARTIZ_LOCATIONS[countryCode]) {
      return window.ARTIZ_LOCATIONS[countryCode];
    }
    const manifestEl = document.getElementById("artiz-location-manifest");
    if (manifestEl) {
      try {
        const manifest = JSON.parse(manifestEl.textContent);
        const url = manifest[countryCode];
        if (url) {
          await new Promise((resolve) => {
            const s = document.createElement("script");
            s.src = url;
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
          });
        }
      } catch (_) { }
    }
    return window.ARTIZ_LOCATIONS ? window.ARTIZ_LOCATIONS[countryCode] : null;
  }

  function normalizeArabic(text) {
    if (!text) return "";
    return String(text)
      .trim()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u0652]/g, "")
      .toLowerCase();
  }

  function detectActiveCountryCode() {
    // 1. Check Shopify Market active country code (e.g. "IQ", "DZ", "MA", "SA")
    const shopifyCountry = window.Shopify?.country;
    if (shopifyCountry && REGIONAL_DATASETS[shopifyCountry.toUpperCase()]) {
      return shopifyCountry.toUpperCase();
    }

    // 2. Active currency clue
    const activeCurr = window.Shopify?.currency?.active;
    if (activeCurr === "IQD") return "IQ";
    if (activeCurr === "DZD") return "DZ";
    if (activeCurr === "SAR") return "SA";
    if (activeCurr === "MAD") return "MA";

    // 3. Fallback to activeConfig.defaultCountry
    const cfgCountry = (activeConfig?.defaultCountry || "MA").toUpperCase();
    if (REGIONAL_DATASETS[cfgCountry]) return cfgCountry;

    return "MA";
  }

  function getLoggedCustomer() {
    if (loggedCustomer) return loggedCustomer;
    try {
      const custEl = document.getElementById("artiz-logged-customer-data");
      if (custEl) {
        loggedCustomer = JSON.parse(custEl.textContent);
      }
    } catch (_) { }
    return loggedCustomer;
  }

  function getCustomerMatchedLocation() {
    const cust = getLoggedCustomer();
    const activeCountry = detectActiveCountryCode();
    const countryData = REGIONAL_DATASETS[activeCountry] || {};
    const regions = countryData.regions || {};
    const regionNames = Object.keys(regions);
    const countryAliases = countryData.aliases || {};

    if (!cust) {
      const defRegion = regionNames[0] || "";
      const defCities = regions[defRegion] || [];
      return { region: defRegion, city: defCities[0] || "" };
    }

    const rawCity = (cust.city || "").trim();
    const rawProv = (cust.province || "").trim();
    const rawAddr = (cust.address || "").trim();

    const lowerCity = rawCity.toLowerCase();
    const lowerProv = rawProv.toLowerCase();
    const lowerAddr = rawAddr.toLowerCase();

    const normCity = normalizeArabic(rawCity);
    const normProv = normalizeArabic(rawProv);
    const normAddr = normalizeArabic(rawAddr);

    let matchedRegion = "";
    let matchedCity = "";

    // 1. Direct match in country aliases by City (handles English/French transliterations like "Tanger", "Boukhalef", "Casablanca")
    if (lowerCity && countryAliases[lowerCity]) {
      const alias = countryAliases[lowerCity];
      if (alias.region && regions[alias.region]) {
        matchedRegion = alias.region;
        matchedCity = alias.city || "";
      }
    }

    // 2. Direct Arabic match: Check if customer's city matches any city in this country's regions
    if (!matchedCity && normCity) {
      for (const [rName, rCities] of Object.entries(regions)) {
        const found = rCities.find(c => {
          const nc = normalizeArabic(c);
          return nc === normCity || (normCity.length > 2 && (nc.includes(normCity) || normCity.includes(nc)));
        });
        if (found) {
          matchedRegion = rName;
          matchedCity = found;
          break;
        }
      }
    }

    // 3. Match in country aliases by Province (e.g. "Tanger-Tétouan-Al Hoceïma", "TTA", "Grand Casablanca")
    if (!matchedRegion && lowerProv) {
      for (const [aliasKey, aliasVal] of Object.entries(countryAliases)) {
        if (lowerProv === aliasKey || lowerProv.includes(aliasKey) || aliasKey.includes(lowerProv)) {
          if (aliasVal.region && regions[aliasVal.region]) {
            matchedRegion = aliasVal.region;
            if (aliasVal.city) matchedCity = aliasVal.city;
            break;
          }
        }
      }
    }

    // 4. Check Arabic province match
    if (!matchedRegion && normProv) {
      for (const rName of regionNames) {
        const nr = normalizeArabic(rName);
        if (nr === normProv || (normProv.length > 2 && (nr.includes(normProv) || normProv.includes(nr)))) {
          matchedRegion = rName;
          break;
        }
      }
    }

    // 5. Scan address for country aliases keywords (e.g. "Al Irfan 2 Boukhalef 42" -> matches "boukhalef" or "irfan" -> Tanger!)
    if (!matchedCity && lowerAddr) {
      for (const [aliasKey, aliasVal] of Object.entries(countryAliases)) {
        if (aliasKey.length > 2 && lowerAddr.includes(aliasKey)) {
          if (aliasVal.region && regions[aliasVal.region]) {
            matchedRegion = aliasVal.region;
            matchedCity = aliasVal.city || "";
            break;
          }
        }
      }
    }

    // 6. Scan address for Arabic cities in active country
    if (!matchedCity && normAddr) {
      for (const [rName, rCities] of Object.entries(regions)) {
        if (matchedRegion && rName !== matchedRegion) continue;
        const found = rCities.find(c => {
          const nc = normalizeArabic(c);
          return nc.length > 2 && normAddr.includes(nc);
        });
        if (found) {
          if (!matchedRegion) matchedRegion = rName;
          matchedCity = found;
          break;
        }
      }
    }

    // Final safe fallbacks
    if (!matchedRegion) matchedRegion = regionNames[0] || "";
    const regCities = regions[matchedRegion] || ["المركز", "أخرى"];
    if (!matchedCity || !regCities.includes(matchedCity)) {
      matchedCity = regCities[0] || "";
    }

    return { region: matchedRegion, city: matchedCity };
  }

  function escapeRegex(str) {
    return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getCustomerPhone() {
    const cust = getLoggedCustomer();
    if (cust && cust.phone && String(cust.phone).trim() !== "") {
      return String(cust.phone).trim();
    }
    try {
      const saved = localStorage.getItem("artiz_customer_phone");
      if (saved && String(saved).trim() !== "") return String(saved).trim();
    } catch (_) { }
    return "";
  }

  function getCustomerDisplayAddress() {
    const cust = getLoggedCustomer();
    if (!cust) return "";
    let addr = (cust.address || "").trim();
    let city = (cust.city || "").trim();

    if (city && addr) {
      // Clean up any existing duplicate city in addr (e.g. "الحسيمة، بني احمد اوكزان، الحسيمة")
      const cityRegexStart = new RegExp(`^${escapeRegex(city)}[\\s،,-]+`, "i");
      const cityRegexEnd = new RegExp(`[\\s،,-]+${escapeRegex(city)}$`, "i");
      addr = addr.replace(cityRegexStart, "").replace(cityRegexEnd, "").trim();

      // Show street first, then city (e.g. "بني احمد اوكزان، الحسيمة")
      return addr ? `${addr}، ${city}` : city;
    }
    return addr || city || "";
  }

  function isModalOpen() {
    const overlay = document.getElementById("artiz-modal-overlay");
    return !!(overlay && overlay.classList.contains("artiz-active"));
  }

  // 1. Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initArtizCOD);
  } else {
    initArtizCOD();
  }

  async function initArtizCOD() {
    const rootEl = document.getElementById("artiz-cod-global-root") || document.getElementById("artiz-cod-form-wrapper");
    currentShop = rootEl?.dataset.shop || window.Shopify?.shop || window.location.hostname;
    storeCurrency = rootEl?.dataset.currency || window.Shopify?.currency?.active || "IQD";
    storeMoneyFormat = rootEl?.dataset.moneyFormat || window.Shopify?.money_format || window.theme?.moneyFormat || "";
    storeMoneyWithCurrencyFormat = rootEl?.dataset.moneyWithCurrencyFormat || window.Shopify?.money_with_currency_format || "";

    // Synchronous Phase 1: Immediate instant setup (0ms) using fallback/cached config
    activeConfig = getFallbackConfig();
    if (rootEl?.dataset.primaryColor && !activeConfig.primaryColor) activeConfig.primaryColor = rootEl.dataset.primaryColor;
    if (rootEl?.dataset.buttonText && !activeConfig.buttonText) activeConfig.buttonText = rootEl.dataset.buttonText;
    if (activeConfig.primaryColor) {
      document.documentElement.style.setProperty("--artiz-primary", activeConfig.primaryColor);
    }

    const activeCountry = detectActiveCountryCode();
    ensureCountryLocationsLoaded(activeCountry);

    const isInline = activeConfig.displayMode === "inline_form" || activeConfig.displayMode === "embedded";
    const hasProductTarget = Boolean(document.querySelector('form[action*="/cart/add"]') || document.getElementById("artiz-cod-form-wrapper"));

    if (isInline && hasProductTarget) {
      setupInlineProductForm();
    } else {
      injectModalContainer();
      setupAllProductTriggers();
    }
    setupCartPageTrigger();

    // Background Phase 2: Asynchronously fetch remote config from Worker
    fetch(`${WORKER_URL}/public/form-config?shop=${encodeURIComponent(currentShop)}`)
      .then(r => r.json())
      .then(json => {
        const remoteConfig = json.data?.formConfig || json.formConfig;
        if (remoteConfig) {
          activeConfig = { ...activeConfig, ...remoteConfig };
          try {
            localStorage.setItem("artiz_form_config", JSON.stringify(remoteConfig));
            localStorage.setItem("artiz_button_mode", activeConfig.buttonMode || "replace");
          } catch (_) { }
          if (activeConfig.buttonMode === "hijack") {
            document.documentElement.classList.add("artiz-hijack-mode");
            if (document.body) document.body.classList.add("artiz-hijack-mode");
          } else {
            document.documentElement.classList.remove("artiz-hijack-mode");
            if (document.body) document.body.classList.remove("artiz-hijack-mode");
          }
          if (activeConfig.primaryColor) {
            document.documentElement.style.setProperty("--artiz-primary", activeConfig.primaryColor);
          }

          // Instantly sync UI text variables to active DOM elements
          const buyTexts = document.querySelectorAll("#artiz-buy-now-text");
          buyTexts.forEach(el => { el.textContent = activeConfig.buttonText || "أطلب الآن"; });
          const addCartTexts = document.querySelectorAll("#artiz-add-cart-text");
          addCartTexts.forEach(el => { el.textContent = activeConfig.addToCartButtonText || "أضف إلى السلة"; });
          const cartBtnTexts = document.querySelectorAll(".artiz-cart-cod-btn span");
          cartBtnTexts.forEach(el => { el.textContent = activeConfig.cartCheckoutButtonText || "إتمام الطلب"; });
          const formTitles = document.querySelectorAll(".artiz-modal-header h3");
          formTitles.forEach(el => { el.textContent = activeConfig.formTitle || "معلومات الطلب"; });
          const submitLabels = document.querySelectorAll("#artiz-btn-label");
          submitLabels.forEach(el => { el.textContent = getSubmitButtonLabel(); });

          setupAllProductTriggers();
          setupCartPageTrigger();
        }
        activeShippingConfig = json.data?.shippingConfig || null;
        activePaymentConfig = json.data?.paymentConfig || null;
        if (activePaymentConfig?.defaultMethod) {
          selectedPaymentMethod = activePaymentConfig.defaultMethod;
        }
        if (activeShippingConfig?.shopCurrency) {
          storeCurrency = activeShippingConfig.shopCurrency;
        } else if (window.Shopify?.currency?.active) {
          storeCurrency = window.Shopify.currency.active;
        }
      })
      .catch(e => {
        console.warn("[Artiz COD] Using initial config:", e);
      });

    // Universal DOM MutationObserver: Re-attaches triggers on Section Rendering API without self-looping
    if (window.MutationObserver) {
      let domTimeout = null;
      const domObserver = new MutationObserver((mutations) => {
        // Skip mutations that occur within Artiz's own DOM trees to prevent loops
        const onlyArtiz = mutations.every(m => {
          const t = m.target;
          return t && (
            t.closest?.("#artiz-modal-overlay, .artiz-modal-container, #artiz-inline-product-form, .artiz-dual-actions, #artiz-replacement-styles") ||
            t.id === "artiz-modal-overlay" ||
            t.id === "artiz-replacement-styles"
          );
        });
        if (onlyArtiz) return;

        if (domTimeout) clearTimeout(domTimeout);
        domTimeout = setTimeout(() => {
          setupAllProductTriggers();
          setupCartPageTrigger();
        }, 150);
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
    }

    // Standard theme event listeners for cart changes
    const onCartChanged = async () => {
      // Only refresh if modal is currently open or inline form exists!
      if (!isModalOpen() && !document.getElementById("artiz-inline-product-form")) return;

      try {
        const cRes = await fetch("/cart.js?_t=" + Date.now());
        const cart = await cRes.json();
        if (cart.currency) storeCurrency = cart.currency;
        if (cart.items && cart.items.length > 0) {
          orderItems = cart.items.map(item => mapCartItemToOrderItem(item));
          renderOrderItemsList();
        }
      } catch (_) { }
    };
    document.addEventListener("cart:updated", onCartChanged);
    document.addEventListener("cart:refresh", onCartChanged);
  }

  function getFallbackConfig() {
    let cached = {};
    try {
      const stored = localStorage.getItem("artiz_form_config");
      if (stored) cached = JSON.parse(stored) || {};
    } catch (_) { }

    let cachedMode = cached.buttonMode || "replace";
    try {
      if (!cached.buttonMode) {
        cachedMode = localStorage.getItem("artiz_button_mode") || "replace";
      }
    } catch (_) { }

    const defaults = {
      displayMode: "popup_modal",
      buttonMode: cachedMode,
      showAddToCartButton: true,
      // Dedicated UI Text Identifiers
      buttonText: "أطلب الآن",
      submitButtonText: "إكمال الدفع",
      formTitle: "معلومات الطلب",
      addToCartButtonText: "أضف إلى السلة",
      addingToCartText: "جاري الإضافة...",
      addedToCartText: "✓ تمت الإضافة",
      cartCheckoutButtonText: "إتمام الطلب",
      submittingOrderText: "جاري تأكيد وتسجيل طلبك...",
      outOfStockText: "غير متوفر",
      checkoutCartOnlyText: "إتمام طلب السلة",
      emptyCartText: "السلة فارغة",
      emptyCartAlert: "سلة التسوق فارغة، يرجى إضافة منتجات أولاً.",
      primaryColor: "#020a25",
      secondaryColor: "#ffffff",
      enableDiscounts: true,
      enableAffiliateTracking: true,
      enableCartSummary: true,
      directBuyTrigger: true,
      cartDrawerTrigger: true,
      requiredFields: { name: true, phone: true, city: true, address: true, note: false },
      citiesList: ["الدار البيضاء", "الرباط", "مراكش", "فاس", "طنجة", "أكادير", "الرياض", "جدة", "أخرى"]
    };

    return Object.assign(defaults, cached);
  }


  function applyButtonReplacementStyles() {
    if (activeConfig && activeConfig.buttonMode === "hijack") return;
    if (document.getElementById("artiz-replacement-styles")) return;

    const style = document.createElement("style");
    style.id = "artiz-replacement-styles";
    style.textContent = `
      body:not(.artiz-hijack-mode) form[action*="/cart/add"] buy-buttons button[type="submit"]:not(.artiz-btn),
      body:not(.artiz-hijack-mode) form[action*="/cart/add"] buy-buttons [data-shopify="payment-button"],
      body:not(.artiz-hijack-mode) form[action*="/cart/add"] .shopify-payment-button,
      body:not(.artiz-hijack-mode) form[action*="/cart/add"] > button[type="submit"]:not(.artiz-btn),
      body:not(.artiz-hijack-mode) form[action*="/cart/add"] button[name="add"]:not(.artiz-btn),
      body:not(.artiz-hijack-mode) quick-buy-drawer buy-buttons button[type="submit"]:not(.artiz-btn),
      body:not(.artiz-hijack-mode) quick-buy-drawer buy-buttons [data-shopify="payment-button"],
      body:not(.artiz-hijack-mode) quick-buy-drawer .shopify-payment-button,
      body:not(.artiz-hijack-mode) quick-buy-drawer button[name="add"]:not(.artiz-btn),
      body:not(.artiz-hijack-mode) cart-drawer form[action*="/cart"] button[name="checkout"],
      body:not(.artiz-hijack-mode) .cart-drawer form[action*="/cart"] button[name="checkout"],
      body:not(.artiz-hijack-mode) form.cart-form button[name="checkout"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function setupAllProductTriggers() {
    if (!activeConfig || !activeConfig.directBuyTrigger) return;
    const forms = document.querySelectorAll('form[action*="/cart/add"]');
    forms.forEach(f => {
      setupProductPageTrigger(f);
    });
  }

  // 2. Setup Product Page Trigger (Inline Form vs Modal/Drawer Trigger Buttons vs Native Hijack)
  function setupProductPageTrigger(productForm) {
    if (!activeConfig || !activeConfig.directBuyTrigger) return;

    if (!productForm) {
      productForm = document.querySelector('form[action*="/cart/add"]');
    }
    if (!productForm) return;

    const isInline = activeConfig.displayMode === "inline_form" || activeConfig.displayMode === "embedded";
    if (isInline) {
      setupInlineProductForm(productForm);
      return;
    }

    // --- Mode 2: Native Button Hijack ---
    if (activeConfig.buttonMode === "hijack") {
      setupNativeButtonHijack(productForm);
      return;
    }

    // --- Mode 1: Button Replacement ---
    applyButtonReplacementStyles();

    // Check if this specific form or its immediate container already has actions container
    const existingContainer = productForm.querySelector(".artiz-dual-actions")
      || productForm.parentElement?.querySelector(":scope > .artiz-dual-actions")
      || (productForm.id ? document.querySelector(`.artiz-dual-actions[data-for-form="${productForm.id}"]`) : null);

    if (existingContainer) {
      // Clean up any extra accidental duplicate sibling containers
      const allNearby = (productForm.parentElement || productForm).querySelectorAll(".artiz-dual-actions");
      if (allNearby.length > 1) {
        for (let i = 1; i < allNearby.length; i++) {
          allNearby[i].remove();
        }
      }

      // Update visibility of Add to Cart button if settings changed
      const addCartBtn = existingContainer.querySelector(".artiz-secondary-btn");
      if (activeConfig.showAddToCartButton === false) {
        if (addCartBtn) addCartBtn.remove();
        existingContainer.classList.add("artiz-single-action");
      }
      updateProductButtonsAvailability(productForm);
      return;
    }

    // If an App Block (#artiz-cod-form-wrapper) is already present and visible in this product section, do not duplicate!
    const nearbyAppBlock = productForm.closest(".product, .product-info, [data-section-type='product'], main")?.querySelector("#artiz-cod-form-wrapper");
    if (nearbyAppBlock) {
      updateProductButtonsAvailability(productForm);
      return;
    }

    const container = document.createElement("div");
    if (productForm.id) container.setAttribute("data-for-form", productForm.id);
    container.className = "artiz-dual-actions";

    if (activeConfig.showAddToCartButton !== false) {
      const addCartBtn = document.createElement("button");
      addCartBtn.type = "button";
      addCartBtn.className = "artiz-btn artiz-btn-secondary artiz-secondary-btn";
      addCartBtn.innerHTML = `
        <svg class="artiz-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <span id="artiz-add-cart-text">${activeConfig.addToCartButtonText || "أضف إلى السلة"}</span>
      `;

      addCartBtn.addEventListener("click", function (e) {
        e.preventDefault();
        handleAddToCart(productForm, addCartBtn);
      });
      container.appendChild(addCartBtn);
    } else {
      container.classList.add("artiz-single-action");
    }

    const buyNowBtn = document.createElement("button");
    buyNowBtn.type = "button";
    buyNowBtn.className = "artiz-btn artiz-btn-primary artiz-cod-trigger-btn artiz-pulse";
    buyNowBtn.innerHTML = `
      <svg class="artiz-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
      </svg>
      <span id="artiz-buy-now-text">${activeConfig.buttonText || "أطلب الآن"}</span>
    `;

    buyNowBtn.addEventListener("click", function (e) {
      e.preventDefault();
      handleSmartCheckout(productForm, buyNowBtn);
    });

    container.appendChild(buyNowBtn);

    const submitBtn = productForm.querySelector('buy-buttons, .product-form__buttons, button[type="submit"], input[type="submit"]');
    if (submitBtn && submitBtn.parentNode) {
      submitBtn.parentNode.insertBefore(container, submitBtn.nextSibling);
    } else {
      productForm.appendChild(container);
    }

    updateProductButtonsAvailability(productForm);
    watchVariantChanges(productForm);
  }

  function setupNativeButtonHijack(productForm) {
    if (!productForm) return;

    // Only intercept Buy Now / Dynamic Checkout buttons - leave native Add to Cart 100% untouched!
    const buyNowSelectors = [
      '[data-shopify="payment-button"] button',
      '.shopify-payment-button__button',
      'shopify-buy-it-now-button button',
      '.shopify-payment-button [role="button"]',
      'buy-buttons [data-shopify="payment-button"] button',
      'button.shopify-payment-button__button--unbranded'
    ];

    const buyNowBtns = productForm.querySelectorAll(buyNowSelectors.join(", "));
    buyNowBtns.forEach(btn => {
      if (!btn._artizHijacked) {
        btn._artizHijacked = true;
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleSmartCheckout(productForm, btn);
        }, true);
      }
    });
  }

  function setupInlineProductForm(productForm) {
    if (document.getElementById("artiz-inline-product-form")) return;

    if (!productForm) {
      productForm = document.querySelector('form[action*="/cart/add"]');
    }

    const wrapper = document.getElementById("artiz-cod-form-wrapper");

    const container = document.createElement("div");
    container.id = "artiz-inline-product-form";
    container.className = "artiz-inline-container";
    container.innerHTML = generateFormInnerHtml(true);

    if (wrapper) {
      wrapper.innerHTML = "";
      wrapper.appendChild(container);
    } else if (productForm) {
      const submitBtn = productForm.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn && submitBtn.parentNode) {
        submitBtn.parentNode.insertBefore(container, submitBtn.nextSibling);
      } else {
        productForm.appendChild(container);
      }
    } else {
      const mainContainer = document.querySelector('.product__info-container, .product-form, main, [data-section-type="product"]');
      if (mainContainer) {
        mainContainer.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    }

    bindFormEvents();

    // Auto-populate customer phone and address if empty
    const pInput = document.getElementById("artiz-input-phone");
    if (pInput && !pInput.value) {
      const p = getCustomerPhone();
      if (p) pInput.value = p;
    }
    const aInput = document.getElementById("artiz-input-address");
    if (aInput && !aInput.value) {
      const a = getCustomerDisplayAddress();
      if (a) aInput.value = a;
    }

    if (activeConfig.addressMode === "cascading") {
      matchCustomerCascadingLocation();
    }

    if (productForm) {
      syncInlineProductForm(productForm);
      watchVariantChanges(productForm);
    }
  }

  function watchVariantChanges(productForm) {
    if (!productForm || productForm._artizVariantWatched) return;
    productForm._artizVariantWatched = true;

    const onVariantChange = () => {
      setTimeout(() => {
        if (document.getElementById("artiz-inline-product-form")) {
          syncInlineProductForm(productForm);
        } else {
          updateProductButtonsAvailability(productForm);
        }
      }, 60);
    };

    productForm.addEventListener("change", onVariantChange);
    productForm.addEventListener("input", function (e) {
      if (e.target && (e.target.name === "quantity" || e.target.name === "id")) {
        onVariantChange();
      }
    });

    if (!window._artizGlobalVariantWatched) {
      window._artizGlobalVariantWatched = true;

      document.addEventListener("change", function (e) {
        if (e.target && (
          e.target.name === "id" ||
          (e.target.name && e.target.name.startsWith("options[")) ||
          e.target.closest("variant-radios, variant-selects, .variant-picker, .product-form")
        )) {
          const form = e.target.closest('form[action*="/cart/add"]') || document.querySelector('form[action*="/cart/add"]');
          if (form) setTimeout(() => {
            if (document.getElementById("artiz-inline-product-form")) {
              syncInlineProductForm(form);
            } else {
              updateProductButtonsAvailability(form);
            }
          }, 60);
        }
      });

      document.addEventListener("variant:change", function (e) {
        const form = e.target?.closest?.('form[action*="/cart/add"]') || document.querySelector('form[action*="/cart/add"]');
        if (form) setTimeout(() => {
          if (document.getElementById("artiz-inline-product-form")) {
            syncInlineProductForm(form);
          } else {
            updateProductButtonsAvailability(form);
          }
        }, 60);
      });

      window.addEventListener("popstate", function () {
        const form = document.querySelector('form[action*="/cart/add"]');
        if (form) setTimeout(() => {
          if (document.getElementById("artiz-inline-product-form")) {
            syncInlineProductForm(form);
          } else {
            updateProductButtonsAvailability(form);
          }
        }, 60);
      });
    }

    const variantInput = productForm.querySelector('input[name="id"], select[name="id"]');
    if (variantInput && window.MutationObserver) {
      const observer = new MutationObserver(onVariantChange);
      observer.observe(variantInput, { attributes: true, attributeFilter: ["value"] });
    }
  }

  async function getVariantDetails(productForm) {
    if (!productForm) return { variantId: null, available: true, price: 0, compareAtPrice: 0, title: "", variantTitle: "", image: "" };

    let variantId = null;
    try {
      const fd = new FormData(productForm);
      variantId = fd.get("id");
    } catch (_) { }
    if (!variantId) {
      const variantInput = productForm.querySelector('input[name="id"]:not([disabled]), select[name="id"]:not([disabled])')
        || productForm.querySelector('input[name="id"], select[name="id"]');
      if (variantInput) variantId = variantInput.value;
    }
    if (!variantId && productForm.id) {
      const extInput = document.querySelector(`input[name="id"][form="${productForm.id}"], select[name="id"][form="${productForm.id}"]`);
      if (extInput) variantId = extInput.value;
    }
    if (!variantId) {
      const urlParams = new URLSearchParams(window.location.search);
      variantId = urlParams.get("variant");
    }
    if (!variantId) {
      variantId = window.ShopifyAnalytics?.meta?.selectedVariantId || null;
    }

    // Check native theme button state first (Dawn and other themes disable button if out of stock)
    const nativeAddBtn = productForm.querySelector('button[name="add"], buy-buttons button[type="submit"], input[name="add"]');
    const isNativeDisabled = nativeAddBtn && (nativeAddBtn.disabled || nativeAddBtn.hasAttribute("disabled") || nativeAddBtn.classList.contains("disabled"));

    let available = !isNativeDisabled;
    let price = 0;
    let compareAtPrice = 0;
    let title = document.querySelector("h1")?.innerText?.trim() || "";
    let variantTitle = "";
    let image = "";

    const pathname = window.location.pathname;
    const parts = pathname.split("/products/");
    const productHandle = parts.length > 1 ? parts[1].split("/")[0].split("?")[0] : null;

    if (productHandle) {
      try {
        let pData = productDetailCache[productHandle];
        if (!pData) {
          const pRes = await fetch(`/products/${productHandle}.js`);
          pData = await pRes.json();
          productDetailCache[productHandle] = pData;
        }
        if (pData) {
          title = pData.title || title;
          image = pData.featured_image || "";
          let variantObj = null;
          if (variantId) {
            variantObj = pData.variants?.find(v => String(v.id) === String(variantId));
          }
          if (!variantObj && pData.variants?.length > 0) {
            variantObj = pData.variants[0];
          }
          if (variantObj) {
            variantId = variantObj.id;
            available = isNativeDisabled ? false : (variantObj.available !== false);
            price = variantObj.price / 100;
            compareAtPrice = variantObj.compare_at_price ? (variantObj.compare_at_price / 100) : price;
            variantTitle = variantObj.title !== "Default Title" ? variantObj.title : "";
            if (variantObj.featured_image?.src) image = variantObj.featured_image.src;
          }
        }
      } catch (_) { }
    }

    return { variantId, available, price, compareAtPrice, title, variantTitle, image };
  }

  async function updateProductButtonsAvailability(productForm) {
    if (!productForm || activeConfig.buttonMode === "hijack") return;

    const addCartBtns = productForm.querySelectorAll(".artiz-secondary-btn, #artiz-product-add-cart-btn");
    const buyNowBtns = productForm.querySelectorAll(".artiz-cod-trigger-btn:not(.artiz-cart-cod-btn), #artiz-direct-buy-btn");
    if (addCartBtns.length === 0 && buyNowBtns.length === 0) return;

    const details = await getVariantDetails(productForm);

    if (!details.available) {
      addCartBtns.forEach(btn => {
        btn.disabled = true;
        btn.classList.add("artiz-btn-disabled");
        const tSpan = btn.querySelector("#artiz-add-cart-text") || btn.querySelector("span") || btn;
        tSpan.textContent = activeConfig?.outOfStockText || "غير متوفر";
      });

      let hasCartItems = false;
      try {
        const cRes = await fetch("/cart.js");
        const cart = await cRes.json();
        hasCartItems = cart.items && cart.items.length > 0;
      } catch (_) { }

      buyNowBtns.forEach(btn => {
        if (hasCartItems) {
          btn.disabled = false;
          btn.classList.remove("artiz-btn-disabled");
          btn.classList.add("artiz-pulse");
          const tSpan = btn.querySelector("#artiz-buy-now-text") || btn.querySelector("span") || btn;
          tSpan.textContent = activeConfig?.checkoutCartOnlyText || "إتمام طلب السلة";
        } else {
          btn.disabled = true;
          btn.classList.add("artiz-btn-disabled");
          btn.classList.remove("artiz-pulse");
          const tSpan = btn.querySelector("#artiz-buy-now-text") || btn.querySelector("span") || btn;
          tSpan.textContent = activeConfig?.outOfStockText || "غير متوفر";
        }
      });
    } else {
      addCartBtns.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove("artiz-btn-disabled");
        const tSpan = btn.querySelector("#artiz-add-cart-text") || btn.querySelector("span") || btn;
        tSpan.textContent = activeConfig?.addToCartButtonText || "أضف إلى السلة";
      });

      buyNowBtns.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove("artiz-btn-disabled");
        btn.classList.add("artiz-pulse");
        const tSpan = btn.querySelector("#artiz-buy-now-text") || btn.querySelector("span") || btn;
        tSpan.textContent = activeConfig?.buttonText || "أطلب الآن";
      });
    }
  }

  async function syncInlineProductForm(productForm) {
    if (!productForm) return;
    const details = await getVariantDetails(productForm);
    const qtyInput = productForm.querySelector('input[name="quantity"]');
    const quantity = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;

    try {
      const cRes = await fetch("/cart.js?_t=" + Date.now());
      const cart = await cRes.json();
      if (cart.currency) storeCurrency = cart.currency;

      if (cart.items && cart.items.length > 0) {
        orderItems = cart.items.map(item => mapCartItemToOrderItem(item));
      } else if (details.variantId) {
        orderItems = [{
          variantId: details.variantId,
          title: details.title,
          variantTitle: details.variantTitle,
          price: details.price,
          originalPrice: details.compareAtPrice > details.price ? details.compareAtPrice : details.price,
          unitDiscount: 0,
          cartDiscountPercent: 0,
          image: details.image,
          quantity: quantity,
          available: details.available
        }];
      }
      renderOrderItemsList();
    } catch (_) { }
  }

  async function handleAddToCart(productForm, addCartBtn) {
    if (!productForm) productForm = document.querySelector('form[action*="/cart/add"]');
    if (!productForm) return;

    const origHtml = addCartBtn ? addCartBtn.innerHTML : "";
    if (addCartBtn) {
      addCartBtn.disabled = true;
      addCartBtn.classList.add("artiz-btn-loading");
      addCartBtn.innerHTML = `
        <span class="artiz-spinner-sm"></span>
        <span>${activeConfig?.addingToCartText || "جاري الإضافة..."}</span>
      `;
    }

    try {
      const details = await getVariantDetails(productForm);
      if (!details.available) {
        alert("عذراً، هذا المنتج غير متوفر حالياً.");
        if (addCartBtn) {
          addCartBtn.innerHTML = origHtml;
          addCartBtn.disabled = true;
          addCartBtn.classList.remove("artiz-btn-loading");
        }
        return;
      }

      const qtyInput = productForm.querySelector('input[name="quantity"]');
      const quantity = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;

      const formData = new FormData();
      formData.append("id", details.variantId);
      formData.append("quantity", quantity);

      const res = await fetch("/cart/add.js", {
        method: "POST",
        body: formData,
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      const addedData = await res.json();

      if (res.ok) {
        const cartRes = await fetch("/cart.js?_t=" + Date.now());
        const cart = await cartRes.json();
        if (cart.currency) storeCurrency = cart.currency;

        const countBadges = document.querySelectorAll('.cart-count-bubble, [data-cart-count], .cart-count');
        countBadges.forEach(b => { b.textContent = cart.item_count || 0; });

        document.dispatchEvent(new CustomEvent("cart:updated", { detail: { cart, item: addedData } }));
        document.dispatchEvent(new CustomEvent("cart:refresh"));

        if (addCartBtn) {
          addCartBtn.innerHTML = `
            <span>${activeConfig?.addedToCartText || "✓ تمت الإضافة"}</span>
          `;
          setTimeout(() => {
            addCartBtn.innerHTML = origHtml;
            addCartBtn.disabled = false;
            addCartBtn.classList.remove("artiz-btn-loading");
          }, 1800);
        }
      } else {
        alert(addedData.description || "عذراً، تعذر إضافة المنتج إلى السلة.");
        if (addCartBtn) {
          addCartBtn.innerHTML = origHtml;
          addCartBtn.disabled = false;
          addCartBtn.classList.remove("artiz-btn-loading");
        }
      }
    } catch (err) {
      console.error("[Artiz COD] Add to cart error:", err);
      if (addCartBtn) {
        addCartBtn.innerHTML = origHtml;
        addCartBtn.disabled = false;
        addCartBtn.classList.remove("artiz-btn-loading");
      }
    }
  }

  async function handleSmartCheckout(productForm, triggerBtn) {
    if (!productForm) {
      productForm = document.querySelector('form[action*="/cart/add"]');
    }

    let origBtnContent = "";
    if (triggerBtn) {
      origBtnContent = triggerBtn.innerHTML;
      triggerBtn.disabled = true;
      triggerBtn.classList.add("artiz-btn-loading");
      triggerBtn.innerHTML = `<span class="artiz-spinner-sm"></span> <span>${activeConfig?.submittingOrderText || "جاري التحميل..."}</span>`;
    }

    try {
      const details = await getVariantDetails(productForm);
      const qtyInput = productForm?.querySelector('input[name="quantity"]');
      const quantity = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;

      // If variant is unavailable
      if (!details.available) {
        const cRes = await fetch("/cart.js?_t=" + Date.now());
        const cart = await cRes.json();
        if (cart.items && cart.items.length > 0) {
          orderItems = cart.items.map(item => mapCartItemToOrderItem(item));
          openArtizModal();
        } else {
          alert("عذراً، هذا المنتج غير متوفر حالياً ولا توجد منتجات أخرى في سلتك.");
        }
        if (triggerBtn) {
          triggerBtn.innerHTML = origBtnContent;
          triggerBtn.disabled = false;
          triggerBtn.classList.remove("artiz-btn-loading");
        }
        return;
      }

      // Add to Shopify cart with sanitized variantId
      const cleanVariantId = details.variantId ? String(details.variantId).replace(/\D/g, "") : null;
      if (cleanVariantId) {
        const addData = new FormData();
        addData.append("id", cleanVariantId);
        addData.append("quantity", quantity);

        try {
          await fetch("/cart/add.js", {
            method: "POST",
            body: addData,
            headers: { "X-Requested-With": "XMLHttpRequest" }
          });
        } catch (addErr) {
          console.warn("[Artiz COD] /cart/add.js error:", addErr);
        }
      }

      // Fetch the updated cart - Single Source of Truth!
      const cartRes = await fetch("/cart.js?_t=" + Date.now());
      const cart = await cartRes.json();
      if (cart.currency) storeCurrency = cart.currency;

      if (cart.items && cart.items.length > 0) {
        orderItems = cart.items.map(item => mapCartItemToOrderItem(item));
      } else if (cleanVariantId) {
        // Fallback directly to current variant so modal is never blank
        orderItems = [{
          variantId: cleanVariantId,
          title: details.title || "المنتج",
          variantTitle: details.variantTitle || "",
          price: details.price || 0,
          originalPrice: (details.compareAtPrice > details.price ? details.compareAtPrice : details.price) || 0,
          unitDiscount: 0,
          cartDiscountPercent: 0,
          image: details.image || "",
          quantity: quantity,
          available: details.available !== false
        }];
      }

      const countBadges = document.querySelectorAll('.cart-count-bubble, [data-cart-count], .cart-count');
      countBadges.forEach(b => { b.textContent = cart.item_count || orderItems.reduce((s, i) => s + i.quantity, 0); });

      // Open the modal with authentic data
      openArtizModal();

    } catch (err) {
      console.error("[Artiz COD] Error in smart checkout:", err);
      try {
        const cRes = await fetch("/cart.js?_t=" + Date.now());
        const cart = await cRes.json();
        if (cart.items && cart.items.length > 0) {
          orderItems = cart.items.map(item => mapCartItemToOrderItem(item));
        }
      } catch (_) { }
      openArtizModal();
    } finally {
      if (triggerBtn) {
        triggerBtn.innerHTML = origBtnContent;
        triggerBtn.disabled = false;
        triggerBtn.classList.remove("artiz-btn-loading");
      }
    }
  }

  async function handleCartCheckout() {
    try {
      const res = await fetch("/cart.js?_t=" + Date.now());
      const cart = await res.json();
      if (cart.currency) storeCurrency = cart.currency;

      if (!cart.items || cart.items.length === 0) {
        alert(activeConfig?.emptyCartAlert || "سلة التسوق فارغة، يرجى إضافة منتجات أولاً.");
        return;
      }

      orderItems = cart.items.map(item => mapCartItemToOrderItem(item));
      openArtizModal();
    } catch (e) {
      alert("تعذر قراءة بيانات السلة، يرجى المحاولة لاحقاً.");
    }
  }

  // 3. Setup Cart Page & Drawer Triggers
  function setupCartPageTrigger() {
    if (!activeConfig || !activeConfig.cartDrawerTrigger) return;

    // Discover cart forms on page or inside drawers/popups
    const cartForms = document.querySelectorAll('form[action="/cart"], form[action*="/cart?"], [data-cart-drawer] form, cart-drawer form, .cart-drawer form');
    cartForms.forEach(cartForm => {
      const checkoutBtn = cartForm.querySelector('[name="checkout"], input[type="submit"][value*="checkout" i], button[type="submit"], .cart__checkout-button, .drawer__checkout');
      if (!checkoutBtn) return;

      if (activeConfig.buttonMode === "hijack") {
        if (!checkoutBtn._artizHijacked) {
          checkoutBtn._artizHijacked = true;
          checkoutBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            handleCartCheckout();
          }, true);
        }
        return;
      }

      // Replace Mode: Hide native checkout button and show COD checkout button
      checkoutBtn.style.display = "none";

      if (cartForm.querySelector(".artiz-cart-cod-btn")) return;

      const codCartBtn = document.createElement("button");
      codCartBtn.type = "button";
      codCartBtn.className = "artiz-cart-cod-btn artiz-pulse";
      codCartBtn.innerHTML = `
        <svg class="artiz-btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span>${activeConfig?.cartCheckoutButtonText || "إتمام الطلب"}</span>
      `;

      codCartBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        handleCartCheckout();
      });

      if (checkoutBtn.parentNode) {
        checkoutBtn.parentNode.insertBefore(codCartBtn, checkoutBtn.nextSibling);
      }
    });
  }

  function mapCartItemToOrderItem(item) {
    const origPrice = (item.original_price || item.price) / 100;
    const finalPrice = (item.final_price !== undefined ? item.final_price : item.price) / 100;
    const discounts = item.line_level_discount_allocations || item.discounts || [];
    const hasCartDiscount = discounts.length > 0 || (origPrice > finalPrice);
    const unitDiscount = hasCartDiscount ? Math.max(0, origPrice - finalPrice) : 0;
    const discountAmount = (item.original_line_price && item.final_line_price)
      ? ((item.original_line_price - item.final_line_price) / 100)
      : discounts.reduce((sum, d) => sum + (d.amount / 100), 0);
    const discountTitle = discounts[0]?.discount_application?.title || discounts[0]?.title || "تخفيض السلة";
    const cartDiscountPercent = origPrice > finalPrice
      ? Math.round(((origPrice - finalPrice) / origPrice) * 100)
      : 0;

    return {
      variantId: item.variant_id,
      title: item.product_title || item.title,
      variantTitle: item.variant_title || "",
      originalPrice: origPrice > finalPrice ? origPrice : finalPrice,
      price: finalPrice, // The actual payable unit price!
      unitDiscount: Number(unitDiscount.toFixed(2)),
      cartDiscountPercent,
      discountAmount,
      discountTitle,
      image: item.image || item.featured_image?.url || "",
      quantity: item.quantity
    };
  }

  function syncOrderItemsFromCart(cart) {
    if (!cart || !cart.items) return;
    orderItems = cart.items.map(ci => mapCartItemToOrderItem(ci));
    renderOrderItemsList();
  }

  // 4. In-Modal / In-Form Quantity Management & Background Cart Sync
  window.artizUpdateQty = function (index, delta) {
    if (!orderItems[index]) return;
    const item = orderItems[index];
    item.quantity += delta;
    if (item.quantity <= 0) {
      if (orderItems.length > 1) {
        orderItems.splice(index, 1);
      } else {
        item.quantity = 1;
        return;
      }
    }
    renderOrderItemsList();

    // Background sync to Shopify cart
    if (item && item.variantId) {
      const rawVariantId = String(item.variantId).replace("gid://shopify/ProductVariant/", "");
      fetch("/cart/change.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rawVariantId,
          quantity: item.quantity <= 0 ? 0 : item.quantity
        })
      }).then(r => r.json()).then(cart => {
        const isInCart = cart.items && cart.items.some(ci => String(ci.variant_id) === String(rawVariantId));
        if (!isInCart && item.quantity > 0) {
          // If not in cart, add it!
          return fetch("/cart/add.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: rawVariantId, quantity: item.quantity })
          }).then(r => r.json()).then(async () => {
            const cRes = await fetch("/cart.js");
            return await cRes.json();
          });
        }
        return cart;
      }).then(cart => {
        if (!cart) return;
        const countBadges = document.querySelectorAll('.cart-count-bubble, [data-cart-count], .cart-count');
        countBadges.forEach(b => {
          b.textContent = cart.item_count || 0;
        });
        syncOrderItemsFromCart(cart);
      }).catch(() => { });
    }
  };

  window.artizRemoveItem = function (index) {
    if (!orderItems[index]) return;
    const item = orderItems[index];
    orderItems.splice(index, 1);
    renderOrderItemsList();

    // Background sync to Shopify cart
    if (item && item.variantId) {
      const rawVariantId = String(item.variantId).replace("gid://shopify/ProductVariant/", "");
      fetch("/cart/change.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rawVariantId,
          quantity: 0
        })
      }).then(r => r.json()).then(cart => {
        const countBadges = document.querySelectorAll('.cart-count-bubble, [data-cart-count], .cart-count');
        countBadges.forEach(b => {
          b.textContent = cart.item_count || 0;
        });
        syncOrderItemsFromCart(cart);
      }).catch(() => { });
    }
  };

  // 5. Generate Checkout Form HTML (Unified for Modal, Drawer and Inline Embedded Mode)
  function generateFormInnerHtml(isInline = false) {
    const activeCountry = detectActiveCountryCode();
    const countryData = REGIONAL_DATASETS[activeCountry] || REGIONAL_DATASETS["MA"];
    const regionNames = Object.keys(countryData.regions);

    // Auto-resolve customer's matching region and city before rendering HTML
    const matchedLoc = getCustomerMatchedLocation();
    const initialRegion = matchedLoc.region || regionNames[0];
    const initialCities = countryData.regions[initialRegion] || ["المركز", "أخرى"];
    const initialCity = matchedLoc.city || initialCities[0];

    // Contextual labels based on detected country
    const regionLabel = activeCountry === "IQ" ? "المحافظة *" : (activeCountry === "DZ" ? "الولاية *" : "الولاية / الجهة *");
    const cityLabel = activeCountry === "IQ" ? "المدينة / القضاء *" : (activeCountry === "DZ" ? "المدينة / البلدية *" : "المدينة / الإقليم *");

    return `
      <div class="artiz-modal-container" id="${isInline ? 'artiz-inline-box' : 'artiz-modal-box'}">
        <div class="artiz-modal-header">
          <h3>${activeConfig.formTitle || "معلومات الطلب"}</h3>
          ${!isInline ? `<button type="button" class="artiz-close-btn" id="artiz-modal-close-btn">✕</button>` : ""}
        </div>

        <!-- Free Shipping Progress Bar Container -->
        <div id="artiz-free-shipping-container" style="padding: 0 24px;"></div>

        <!-- Order Items Section -->
        <div class="artiz-section-box" id="artiz-items-section">
          <div class="artiz-items-list" id="artiz-items-render-list"></div>
          
          ${activeConfig.enableDiscounts ? `
            <div class="artiz-coupon-box">
              <input type="text" id="artiz-coupon-code" class="artiz-coupon-input" placeholder="كود الخصم / Coupon Code">
              <button type="button" id="artiz-apply-coupon" class="artiz-coupon-btn">تطبيق</button>
            </div>
          ` : ""}

          <!-- Summary Breakdown Box -->
          <div class="artiz-summary-lines" id="artiz-summary-lines"></div>
        </div>

        <!-- Customer Form Section -->
        <form id="artiz-checkout-form" class="artiz-form-body">
          ${(() => {
        const cust = getLoggedCustomer();
        if (!cust) return "";
        return `
              <div class="artiz-logged-in-banner">
                <div class="artiz-logged-in-avatar">👤</div>
                <div class="artiz-logged-in-content">
                  <div class="artiz-logged-in-title">
                    <span class="artiz-logged-in-name">مرحباً، ${cust.name || cust.firstName || "عميلنا العزيز"}</span>
                    <span class="artiz-logged-in-badge">مسجل الدخول</span>
                  </div>
                  <p class="artiz-logged-in-desc">تم ملء بيانات الشحن المسجلة بحسابك تلقائياً. يمكنك تعديل أي حقل أدناه للشحن إلى عنوان مختلف.</p>
                </div>
              </div>
            `;
      })()}

          ${activeConfig.requiredFields?.name !== false ? `
            <div class="artiz-field-group">
              <label>الاسم الكامل *</label>
              <input type="text" id="artiz-input-name" required placeholder="مثال: أحمد محمد" value="${getLoggedCustomer()?.name || ""}">
            </div>
          ` : ""}

          ${activeConfig.requiredFields?.phone !== false ? `
            <div class="artiz-field-group">
              <label>رقم الهاتف للتوصيل *</label>
              <input type="tel" id="artiz-input-phone" required placeholder="${countryData.phonePlaceholder || 'مثال: 0612345678'}" value="${getCustomerPhone()}">
            </div>
          ` : ""}

          ${activeConfig.requiredFields?.email ? `
            <div class="artiz-field-group">
              <label>البريد الإلكتروني (اختياري)</label>
              <input type="email" id="artiz-input-email" placeholder="example@email.com" value="${getLoggedCustomer()?.email || ""}">
            </div>
          ` : ""}

          ${(activeConfig.addressMode === "cascading") ? `
            <!-- Cascading Location Selector (Region -> City) with Dynamic Country Detection -->
            <div class="artiz-location-grid">
              <div class="artiz-field-group">
                <label>${regionLabel}</label>
                <select id="artiz-input-region" required>
                  ${regionNames.map(r => `<option value="${r}" ${r === initialRegion ? "selected" : ""}>${r}</option>`).join("")}
                  <option value="other">أخرى...</option>
                </select>
              </div>

              <div class="artiz-field-group">
                <label>${cityLabel}</label>
                <select id="artiz-input-city" required>
                  ${initialCities.map(c => `<option value="${c}" ${c === initialCity ? "selected" : ""}>${c}</option>`).join("")}
                  <option value="other">مدينة / قضاء أخرى...</option>
                </select>
              </div>
            </div>

            ${activeConfig.requiredFields?.address !== false ? `
              <div class="artiz-field-group">
                <label>العنوان التفصيلي: رقم الدار / عمارة، الزقاق، المحلة، الحي، المدينة / المحافظة *</label>
                <textarea id="artiz-input-address" required placeholder="مثال: دار 18، زقاق 24، محلة 603، حي المنصور، بغداد">${getLoggedCustomer()?.address || ""}</textarea>
              </div>
            ` : ""}
          ` : `
            <!-- Mode 1: Classic Manual Address (Unified Shipping Engine - No City Dropdowns) -->
            ${activeConfig.requiredFields?.address !== false ? `
              <div class="artiz-field-group">
                <label>العنوان التفصيلي: رقم الدار / عمارة، الزقاق، المحلة، الحي، المدينة / المحافظة *</label>
                <textarea id="artiz-input-address" required placeholder="مثال: دار 18، زقاق 24، محلة 603، حي المنصور، بغداد">${getCustomerDisplayAddress()}</textarea>
              </div>
            ` : ""}
          `}

          ${activeConfig.requiredFields?.note ? `
            <div class="artiz-field-group">
              <label>ملاحظات التوصيل (اختياري)</label>
              <input type="text" id="artiz-input-note" placeholder="مثال: يرجى الاتصال قبل الوصول بـ 15 دقيقة">
            </div>
          ` : ""}

          <!-- Multi-Payment Methods Selector -->
          ${renderPaymentMethodsSelector()}

          <button type="submit" id="artiz-submit-order-btn" class="artiz-submit-button">
            <span id="artiz-btn-spinner" class="artiz-spinner" style="display:none;"></span>
            <span id="artiz-btn-label">${getSubmitButtonLabel()}</span>
          </button>
        </form>
      </div>
    `;
  }

  function getSubmitButtonLabel() {
    return activeConfig.submitButtonText || activeConfig.buttonText || "أطلب الآن";
  }

  function renderPaymentMethodsSelector() {
    const methods = activePaymentConfig?.methods || {
      cod: { id: "cod", enabled: true, title: "الدفع عند الاستلام", subtitle: "💵 ادفع بكل أمان وقت استلام المنتج.", badge: "نقدي", icon: "cash" },
      wayl: { id: "wayl", enabled: false, title: "دفع إلكتروني - WAYL", subtitle: "دفع آمن — SSL & 3D Secure", badge: "دفع آمن 100%", icon: "electronic" }
    };

    const enabledKeys = (activePaymentConfig?.enabledMethods || ["cod"]).filter(k => methods[k]?.enabled === true);

    // If 1 or 0 methods are active, DO NOT show selector!
    if (enabledKeys.length <= 1) {
      if (enabledKeys.length === 1) {
        selectedPaymentMethod = enabledKeys[0];
      } else {
        selectedPaymentMethod = "cod";
      }
      return "";
    }

    if (!enabledKeys.includes(selectedPaymentMethod)) {
      selectedPaymentMethod = enabledKeys[0] || "cod";
    }

    return `
      <div class="artiz-payment-methods-section">
        <label class="artiz-payment-methods-title">طريقة الدفع والتأكيد *</label>
        <div class="artiz-payment-cards-grid">
          ${enabledKeys.map(key => {
      const m = methods[key] || {};
      const isSelected = selectedPaymentMethod === key;
      const iconBadge = (key === "wayl" || m.icon === "electronic" || m.icon === "card") ? "💳" : "💵";
      const displayTitle = (key === "wayl" && (!m.title || m.title.includes("MasterCard") || m.title.includes("بوابة")))
        ? "دفع إلكتروني - WAYL"
        : (m.title || key);
      const displaySubtitle = (key === "wayl" && (!m.subtitle || (m.subtitle.includes("3D Secure") && !m.subtitle.includes("SSL"))))
        ? "دفع آمن — SSL & 3D Secure"
        : (m.subtitle || "");

      return `
              <div class="artiz-payment-card ${isSelected ? 'active' : ''}" data-method="${key}" onclick="window.artizSelectPaymentMethod('${key}')">
                <div class="artiz-pay-radio-col">
                  <input type="radio" name="artiz_payment_choice" value="${key}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); window.artizSelectPaymentMethod('${key}');">
                </div>
                <div class="artiz-pay-info-col">
                  <div class="artiz-pay-header-row">
                    <span class="artiz-pay-icon">${iconBadge}</span>
                    <strong class="artiz-pay-name">${displayTitle}</strong>
                    ${m.badge ? `<span class="artiz-pay-badge">${m.badge}</span>` : ''}
                  </div>
                  ${displaySubtitle ? `<p class="artiz-pay-subtitle">${displaySubtitle}</p>` : ''}
                  ${key === 'wayl' ? `
                    <div class="artiz-pay-gateways-logos">
                      <span class="artiz-brand-tag">MasterCard</span>
                      <span class="artiz-brand-tag">Visa</span>
                      <span class="artiz-brand-tag">ZainCash</span>
                      <span class="artiz-brand-tag">FIB</span>
                      <span class="artiz-brand-tag">FastPay</span>
                      <span class="artiz-brand-tag">Qi Card</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
    }).join("")}
        </div>
      </div>
    `;
  }

  window.artizSelectPaymentMethod = function (methodKey) {
    selectedPaymentMethod = methodKey;
    const cards = document.querySelectorAll(".artiz-payment-card");
    cards.forEach(card => {
      const match = card.getAttribute("data-method") === methodKey;
      card.classList.toggle("active", match);
      const radio = card.querySelector("input[type='radio']");
      if (radio) radio.checked = match;
    });

    const label = document.getElementById("artiz-btn-label");
    if (label) {
      label.textContent = getSubmitButtonLabel();
    }
  };

  function bindFormEvents() {
    // Close events
    const closeBtn = document.getElementById("artiz-modal-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeArtizModal);

    const overlay = document.getElementById("artiz-modal-overlay");
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeArtizModal();
      });
    }

    // Cascading City and Region change events
    const regionSelect = document.getElementById("artiz-input-region");
    const citySelect = document.getElementById("artiz-input-city");
    if (regionSelect && citySelect) {
      matchCustomerCascadingLocation();

      regionSelect.addEventListener("change", function () {
        populateCityDropdown(regionSelect.value);
        renderOrderItemsList();
      });
      citySelect.addEventListener("change", function () {
        renderOrderItemsList();
      });
    }

    // Coupon event
    const couponBtn = document.getElementById("artiz-apply-coupon");
    if (couponBtn) {
      couponBtn.addEventListener("click", handleApplyCoupon);
    }

    // Submit event
    const form = document.getElementById("artiz-checkout-form");
    if (form) {
      form.removeEventListener("submit", handleSubmitOrder);
      form.addEventListener("submit", handleSubmitOrder);
    }
  }

  function injectModalContainer() {
    if (document.getElementById("artiz-modal-overlay")) return;

    const isDrawer = activeConfig.displayMode === "slide_drawer";
    const overlay = document.createElement("div");
    overlay.id = "artiz-modal-overlay";
    overlay.className = `artiz-modal-overlay ${isDrawer ? "artiz-drawer-mode" : ""}`;
    overlay.innerHTML = generateFormInnerHtml(false);

    document.body.appendChild(overlay);
    bindFormEvents();
  }

  function populateCityDropdown(selectedRegion) {
    const citySelect = document.getElementById("artiz-input-city");
    if (!citySelect) return;

    const activeCountry = detectActiveCountryCode();
    const countryData = REGIONAL_DATASETS[activeCountry] || REGIONAL_DATASETS["MA"];
    const cities = countryData.regions[selectedRegion] || ["المركز", "أخرى"];

    citySelect.innerHTML = cities.map(c => `<option value="${c}">${c}</option>`).join("");
    citySelect.innerHTML += `<option value="other">مدينة / قضاء أخرى...</option>`;

    // If customer had an existing city, pre-select it
    const custCity = getLoggedCustomer()?.city;
    if (custCity) {
      const normCustCity = normalizeArabic(custCity);
      const match = Array.from(citySelect.options).find(o => {
        const no = normalizeArabic(o.value);
        return no === normCustCity || (normCustCity.length > 2 && (no.includes(normCustCity) || normCustCity.includes(no)));
      });
      if (match) citySelect.value = match.value;
    }
  }

  function matchCustomerCascadingLocation() {
    const regionSelect = document.getElementById("artiz-input-region");
    const citySelect = document.getElementById("artiz-input-city");
    if (!regionSelect || !citySelect) return;

    const matchedLoc = getCustomerMatchedLocation();
    if (!matchedLoc.region) {
      if (citySelect.children.length === 0) {
        populateCityDropdown(regionSelect.value);
      }
      return;
    }

    if (regionSelect.value !== matchedLoc.region) {
      const rOpt = Array.from(regionSelect.options).find(o => o.value === matchedLoc.region);
      if (rOpt) {
        regionSelect.value = matchedLoc.region;
        populateCityDropdown(matchedLoc.region);
      }
    } else if (citySelect.children.length === 0) {
      populateCityDropdown(regionSelect.value);
    }

    if (matchedLoc.city && citySelect.value !== matchedLoc.city) {
      const cOpt = Array.from(citySelect.options).find(o => o.value === matchedLoc.city);
      if (cOpt) {
        citySelect.value = matchedLoc.city;
      }
    }
  }

  function openArtizModal() {
    if (!document.getElementById("artiz-modal-overlay")) {
      injectModalContainer();
    }

    // Auto-populate customer phone and address if empty
    const pInput = document.getElementById("artiz-input-phone");
    if (pInput && !pInput.value) {
      const p = getCustomerPhone();
      if (p) pInput.value = p;
    }
    const aInput = document.getElementById("artiz-input-address");
    if (aInput && !aInput.value) {
      const a = getCustomerDisplayAddress();
      if (a) aInput.value = a;
    }

    if (activeConfig.addressMode === "cascading") {
      matchCustomerCascadingLocation();
    }

    const overlay = document.getElementById("artiz-modal-overlay");
    if (overlay) overlay.classList.add("artiz-active");
    renderOrderItemsList(true);
  }

  function closeArtizModal() {
    const overlay = document.getElementById("artiz-modal-overlay");
    if (overlay) overlay.classList.remove("artiz-active");
  }

  window.artizOpenModal = async function () {
    try {
      const cRes = await fetch("/cart.js?_t=" + Date.now());
      const cart = await cRes.json();
      if (cart.currency) storeCurrency = cart.currency;
      if (cart.items && cart.items.length > 0) {
        orderItems = cart.items.map(item => mapCartItemToOrderItem(item));
        openArtizModal();
        return;
      }
    } catch (_) { }

    if (orderItems.length === 0) {
      const productForm = document.querySelector('form[action*="/cart/add"]');
      if (productForm) {
        await handleSmartCheckout(productForm);
        return;
      }
    }
    openArtizModal();
  };
  window.artizCloseModal = closeArtizModal;

  // 6. Render Items List & Recalculate Totals
  function renderOrderItemsList(force = false) {
    const container = document.getElementById("artiz-items-render-list");
    const summaryLines = document.getElementById("artiz-summary-lines");
    const freeShippingContainer = document.getElementById("artiz-free-shipping-container");
    if (!container || !summaryLines) return;

    // Do not run rendering work if modal is closed and we are not in inline mode
    const isInline = document.getElementById("artiz-inline-product-form") !== null;
    if (!force && !isInline && !isModalOpen()) return;

    const activeCountryCode = detectActiveCountryCode();
    const submitBtn = document.getElementById("artiz-submit-order-btn");

    if (orderItems.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:#94a3b8; font-size:14px; margin:20px 0;">${activeConfig?.emptyCartText || "السلة فارغة"}</p>`;
      summaryLines.innerHTML = "";
      if (freeShippingContainer) freeShippingContainer.innerHTML = "";
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    if (submitBtn) submitBtn.disabled = false;

    // Render all cart items cleanly with stepper and remove button
    container.innerHTML = orderItems.map((item, idx) => {
      const hasDiscount = item.originalPrice && item.originalPrice > item.price;
      const discountPercent = hasDiscount ? Math.round((1 - (item.price / item.originalPrice)) * 100) : 0;
      const autoPercent = item.cartDiscountPercent || (item.unitDiscount > 0 && item.originalPrice > 0 ? Math.round((item.unitDiscount / item.originalPrice) * 100) : 0);

      return `
        <div class="artiz-item-card">
          ${item.image ? `<img src="${item.image}" alt="${item.title}" class="artiz-item-thumb">` : ""}
          <div class="artiz-item-info">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:2px;">
              <p class="artiz-item-title" style="margin:0;">${item.title}</p>
              ${item.available === false ? `<span class="artiz-stock-out-badge">نفذ من المخزون</span>` : ""}
              ${autoPercent > 0 ? `<span class="artiz-discount-tag artiz-auto-discount-badge">-${autoPercent}%</span>` : ""}
            </div>
            ${item.variantTitle ? `<p class="artiz-item-variant">${item.variantTitle}</p>` : ""}
            <div class="artiz-price-stack">
              <span class="artiz-item-price">${formatMoney(item.price * item.quantity)}</span>
              ${hasDiscount ? `
                <span class="artiz-item-compare-price">${formatMoney(item.originalPrice * item.quantity)}</span>
                <span class="artiz-discount-tag">خصم ${discountPercent}%</span>
              ` : ""}
            </div>
          </div>
          <div class="artiz-stepper">
            <button type="button" onclick="artizUpdateQty(${idx}, -1)">-</button>
            <span>${item.quantity}</span>
            <button type="button" onclick="artizUpdateQty(${idx}, 1)">+</button>
          </div>
          ${orderItems.length > 1 ? `<button type="button" class="artiz-item-remove" onclick="artizRemoveItem(${idx})" title="حذف">✕</button>` : ""}
        </div>
      `;
    }).join("");

    // Calculate Subtotals & Savings
    const subtotal = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const originalSubtotal = orderItems.reduce((acc, item) => acc + ((item.originalPrice || item.price) * item.quantity), 0);
    const catalogSavings = Math.max(0, originalSubtotal - subtotal);

    let couponDiscount = 0;
    if (appliedDiscount) {
      couponDiscount = appliedDiscount.type === "percentage" ? (subtotal * appliedDiscount.amount / 100) : appliedDiscount.amount;
    }
    const totalSavings = catalogSavings + couponDiscount;

    // Shipping Calculation
    const shippingGen = activeShippingConfig?.general || {
      enabled: true,
      defaultTitle: "توصيل سريع لكافة المحافظات",
      defaultRate: 5000,
      defaultPrice: 5000,
      freeShippingEnabled: true,
      freeShippingThreshold: 50000,
      freeShippingText: "مجاناً",
      allowMultipleMethods: false,
      defaultMethods: [
        { id: "standard", title: "توصيل سريع لكافة المحافظات", price: 5000 }
      ]
    };

    const threshold = Number(shippingGen.freeShippingThreshold || 0);
    const freeShippingActive = Boolean(shippingGen.freeShippingEnabled || shippingGen.enableFreeShipping);
    const isFreeShipping = freeShippingActive && threshold > 0 && subtotal >= threshold;

    let shippingCost = 0;
    let shippingTitle = shippingGen.defaultTitle || "توصيل سريع لجميع المدن";
    let shippingMethodsHtml = "";

    if (isFreeShipping) {
      shippingCost = 0;
      shippingTitle = "توصيل مجاني";
      currentCalculatedShipping = { cost: 0, title: shippingTitle, isFree: true };

      if (freeShippingContainer) {
        freeShippingContainer.innerHTML = `
          <div class="artiz-free-shipping-bar artiz-free-achieved">
            <span class="artiz-shipping-icon">🎉</span>
            <div class="artiz-shipping-msg">
              <strong>مبروك!</strong> لقد حصلت على <strong>توصيل مجاني</strong> لطلبك!
            </div>
          </div>
        `;
      }
    } else {
      // Free Shipping Progress Bar
      if (freeShippingContainer && freeShippingActive && threshold > 0) {
        const remaining = Math.max(0, threshold - subtotal);
        const percent = Math.min(100, Math.round((subtotal / threshold) * 100));
        freeShippingContainer.innerHTML = `
          <div class="artiz-free-shipping-bar">
            <div class="artiz-shipping-msg">
              أضف للسلة <strong>${formatMoney(remaining)}</strong> إضافية للحصول على <strong>شحن مجاني!</strong>
            </div>
            <div class="artiz-progress-track">
              <div class="artiz-progress-fill" style="width: ${percent}%;"></div>
            </div>
          </div>
        `;
      } else if (freeShippingContainer) {
        freeShippingContainer.innerHTML = "";
      }

      // Methods options: match regional custom rates in cascading mode OR from typed/detected city in manual mode
      let methods = null;
      if (activeShippingConfig?.rates && Array.isArray(activeShippingConfig.rates)) {
        let cityVal = "";
        let regionVal = "";
        const regionEl = document.getElementById("artiz-input-region");
        const cityEl = document.getElementById("artiz-input-city");
        if (regionEl) {
          regionVal = (regionEl.value || "").trim().toLowerCase();
        }
        if (cityEl) {
          cityVal = (cityEl.value || "").trim().toLowerCase();
        }
        if (!regionVal && !cityVal) {
          // Manual mode: detect city from address input or logged-in customer
          const rawAddr = (document.getElementById("artiz-input-address")?.value || "").trim().toLowerCase();
          const cust = getLoggedCustomer();
          if (cust?.city) {
            cityVal = cust.city.trim().toLowerCase();
          } else {
            const foundRate = activeShippingConfig.rates.find(r => r.city && rawAddr.includes(r.city.toLowerCase()));
            if (foundRate) cityVal = foundRate.city.toLowerCase();
          }
        }

        let matchedRate = null;

        // Specificity search: City First -> Governorate / Region Second -> Country Third
        if (cityVal) {
          matchedRate = activeShippingConfig.rates.find(r => {
            const rc = (r.city || "").trim().toLowerCase();
            return rc && (rc === cityVal || cityVal.includes(rc) || rc.includes(cityVal));
          });
        }

        if (!matchedRate && regionVal) {
          matchedRate = activeShippingConfig.rates.find(r => {
            const rr = (r.region || "").trim().toLowerCase();
            const rc = (r.city || "").trim().toLowerCase();
            return (rr && (rr === regionVal || regionVal.includes(rr) || rr.includes(regionVal))) ||
              (rc && (rc === regionVal || regionVal.includes(rc) || rc.includes(regionVal)));
          });
        }

        if (!matchedRate && activeCountryCode) {
          matchedRate = activeShippingConfig.rates.find(r => {
            const rcc = (r.countryCode || "").trim().toUpperCase();
            return rcc && rcc === activeCountryCode.toUpperCase();
          });
        }

        if (matchedRate) {
          if (matchedRate.customRates && String(matchedRate.customRates).includes(":")) {
            methods = String(matchedRate.customRates).split("|").map((p, idx) => {
              const [t, pr] = p.split(":");
              return { id: `custom_${idx}`, title: t.trim(), price: Number(pr.trim() || 0) };
            });
          } else {
            const finalCost = matchedRate.cost !== undefined && matchedRate.cost !== null && matchedRate.cost !== ""
              ? Number(matchedRate.cost)
              : (matchedRate.price !== undefined ? Number(matchedRate.price) : Number(shippingGen.defaultPrice || shippingGen.defaultRate || 5000));
            methods = [{
              id: "standard",
              title: matchedRate.deliveryMethod || matchedRate.title || shippingGen.defaultTitle || "توصيل سريع",
              price: finalCost
            }];
          }
        }
      }

      if (!methods || methods.length === 0) {
        let fallbackRate = Number(shippingGen.defaultPrice ?? shippingGen.defaultRate ?? 5000);
        if (fallbackRate === 30) fallbackRate = 5000;
        methods = [
          { id: "standard", title: shippingGen.defaultTitle || "توصيل سريع لكافة المحافظات", price: fallbackRate }
        ];
      }

      if (!selectedShippingMethod || !methods.some(m => m.id === selectedShippingMethod)) {
        selectedShippingMethod = methods[0]?.id || "home";
      }

      const activeMethodObj = methods.find(m => m.id === selectedShippingMethod) || methods[0];
      shippingCost = activeMethodObj.price;
      shippingTitle = activeMethodObj.title;
      currentCalculatedShipping = { cost: shippingCost, title: shippingTitle, isFree: false };

      if (methods.length > 1) {
        shippingMethodsHtml = `
          <div class="artiz-shipping-methods-box">
            <span class="artiz-shipping-methods-header">طريقة التوصيل:</span>
            ${methods.map(m => `
              <label class="artiz-shipping-radio-item ${selectedShippingMethod === m.id ? 'artiz-radio-selected' : ''}">
                <div>
                  <input type="radio" name="artiz_shipping_method" value="${m.id}" ${selectedShippingMethod === m.id ? 'checked' : ''} onchange="window.artizSelectShippingMethod('${m.id}')">
                  <span>${m.title}</span>
                </div>
                <strong>${formatMoney(m.price)}</strong>
              </label>
            `).join("")}
          </div>
        `;
      }
    }

    const grandTotal = Math.max(0, subtotal - couponDiscount + shippingCost);

    // Render Order Summary Box
    summaryLines.innerHTML = `
      <div class="artiz-summary-row">
        <span>المجموع الفرعي:</span>
        <span class="artiz-subtotal-val">${formatMoney(originalSubtotal > subtotal ? originalSubtotal : subtotal)}</span>
      </div>

      ${totalSavings > 0 ? `
        <div class="artiz-summary-row artiz-savings-row">
          <span>إجمالي التوفير والخصم:</span>
          <span class="artiz-savings-badge">وفرت -${formatMoney(totalSavings)}</span>
        </div>
      ` : ""}

      <div class="artiz-summary-row artiz-shipping-row">
        <div class="artiz-shipping-label-group">
          <span>الشحن والتوصيل:</span>
          <small class="artiz-shipping-title">${isFreeShipping ? "توصيل مجاني" : shippingTitle}</small>
        </div>
        <span class="artiz-shipping-cost ${shippingCost === 0 ? 'artiz-text-free' : ''}">
          ${shippingCost === 0 ? 'مجاناً' : formatMoney(shippingCost)}
        </span>
      </div>

      ${shippingMethodsHtml}

      <div class="artiz-summary-row artiz-total-row">
        <span>المجموع الكلي للدفع:</span>
        <span class="artiz-total-val">${formatMoney(grandTotal)}</span>
      </div>
    `;

    // Check if any order item is sold out and block the submit button
    const hasSoldOut = orderItems.some(i => i.available === false);
    if (submitBtn) {
      if (hasSoldOut) {
        submitBtn.disabled = true;
        submitBtn.classList.add("artiz-btn-disabled");
        submitBtn.style.opacity = "0.55";
        submitBtn.style.cursor = "not-allowed";
        const span = submitBtn.querySelector("span") || submitBtn;
        if (!submitBtn._origLabel) submitBtn._origLabel = span.textContent;
        span.textContent = "عذراً، يحتوي طلبك على منتجات نفذت من المخزون";
      } else {
        submitBtn.disabled = false;
        submitBtn.classList.remove("artiz-btn-disabled");
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
        const span = submitBtn.querySelector("span") || submitBtn;
        if (submitBtn._origLabel) {
          span.textContent = submitBtn._origLabel;
        }
      }
    }
  }

  window.artizSelectShippingMethod = function (methodId) {
    selectedShippingMethod = methodId;
    renderOrderItemsList();
  };

  // 7. Coupon Handler
  function handleApplyCoupon() {
    const input = document.getElementById("artiz-coupon-code");
    const code = input ? input.value.trim().toUpperCase() : "";
    if (!code) return;

    appliedDiscount = {
      code,
      type: "percentage",
      amount: 10
    };
    alert(`تم تطبيق كود الخصم بنجاح: ${code}`);
    renderOrderItemsList();
  }

  // 8. Capture Affiliate Attribution
  function getAffiliateTrackingData() {
    const affiliate = {};
    const urlParams = new URLSearchParams(window.location.search);
    const keys = ["ref", "sca_ref", "bixgrow_ref", "bix_aff", "goaffpro_affiliate", "affiliate_id", "via", "partner"];
    keys.forEach(k => {
      if (urlParams.get(k)) affiliate[k] = urlParams.get(k);
    });

    const cookies = document.cookie.split(";");
    cookies.forEach(c => {
      const [k, v] = c.trim().split("=");
      if (k && v) {
        if (keys.includes(k) || k.includes("affiliate") || k.includes("bixgrow") || k.includes("goaffpro")) {
          affiliate[k] = decodeURIComponent(v);
        }
      }
    });

    return affiliate;
  }

  // 9. Handle Order Submission
  async function handleSubmitOrder(e) {
    e.preventDefault();

    if (orderItems.length === 0) {
      alert("يرجى إضافة منتجات للطلب.");
      return;
    }

    const soldOutItem = orderItems.find(i => i.available === false);
    if (soldOutItem) {
      alert(`عذراً، المنتج "${soldOutItem.title}${soldOutItem.variantTitle ? ` (${soldOutItem.variantTitle})` : ''}" نفذ من المخزون حالياً ولا يمكن إتمام طلبه.`);
      return;
    }

    const activeCountryCode = detectActiveCountryCode();
    const countryNames = {
      "MA": "Morocco",
      "DZ": "Algeria",
      "IQ": "Iraq",
      "SA": "Saudi Arabia"
    };
    const defaultCities = {
      "MA": "الدار البيضاء",
      "DZ": "الجزائر",
      "IQ": "بغداد",
      "SA": "الرياض"
    };
    const targetCountry = countryNames[activeCountryCode] || "Morocco";

    const name = document.getElementById("artiz-input-name")?.value.trim() || "عميل المتجر";
    const phone = document.getElementById("artiz-input-phone")?.value.trim() || "";
    const isCascading = Boolean(document.getElementById("artiz-input-region")) && activeConfig?.addressMode === "cascading";
    const cust = getLoggedCustomer();
    const address = document.getElementById("artiz-input-address")?.value.trim() || "العنوان بالمتجر";
    const note = document.getElementById("artiz-input-note")?.value.trim() || "";

    if (!phone || !address) {
      alert("يرجى ملء جميع الحقول الإلزامية.");
      return;
    }

    // Cache customer phone for future visits
    try {
      localStorage.setItem("artiz_customer_phone", phone);
    } catch (_) { }

    // Accurate Region & City resolution (Never lose customer's registered city!)
    let region = "";
    let city = "";
    let cleanAddress = address;

    if (isCascading) {
      region = document.getElementById("artiz-input-region")?.value.trim() || cust?.province || "";
      city = document.getElementById("artiz-input-city")?.value.trim() || cust?.city || defaultCities[activeCountryCode] || "الدار البيضاء";
      cleanAddress = address;
    } else {
      // Manual address mode:
      const countryData = REGIONAL_DATASETS[activeCountryCode] || REGIONAL_DATASETS["MA"];
      const allCities = Object.values(countryData.regions || {}).flat();

      // Sort cities by length descending so multi-word/longer cities match first (e.g. "بغداد الجديدة" before "بغداد")
      const sortedCities = [...allCities].sort((a, b) => b.length - a.length);

      // 1. Search for any known city in the typed address
      const matchedCity = sortedCities.find(c => {
        const re = new RegExp(`(^|[،,\\s-])${escapeRegex(c)}([،,\\s-]|$)`, "i");
        return re.test(address);
      });

      if (matchedCity) {
        city = matchedCity;
        // Strip the matched city from cleanAddress so Shopify doesn't repeat it in address1 and city!
        const startRe = new RegExp(`^${escapeRegex(matchedCity)}[\\s،,-]+`, "i");
        const endRe = new RegExp(`[\\s،,-]+${escapeRegex(matchedCity)}$`, "i");
        const stripped = address.replace(startRe, "").replace(endRe, "").trim();
        if (stripped.length >= 2) {
          cleanAddress = stripped;
        }
      } else if (cust?.city) {
        city = cust.city;
        const startRe = new RegExp(`^${escapeRegex(city)}[\\s،,-]+`, "i");
        const endRe = new RegExp(`[\\s،,-]+${escapeRegex(city)}$`, "i");
        const stripped = address.replace(startRe, "").replace(endRe, "").trim();
        if (stripped.length >= 2) {
          cleanAddress = stripped;
        }
      } else {
        city = defaultCities[activeCountryCode] || "الدار البيضاء";
      }

      // Automatically deduce province/region from the city
      for (const [rName, rCities] of Object.entries(countryData.regions || {})) {
        if (rCities.includes(city)) {
          region = rName;
          break;
        }
      }
    }

    const submitBtn = document.getElementById("artiz-submit-order-btn");
    const spinner = document.getElementById("artiz-btn-spinner");
    const label = document.getElementById("artiz-btn-label");

    if (submitBtn) submitBtn.disabled = true;
    if (spinner) spinner.style.display = "inline-block";
    if (label) label.textContent = activeConfig?.submittingOrderText || "جاري تأكيد وتسجيل طلبك...";

    try {
      const affiliateData = getAffiliateTrackingData();
      const cust = getLoggedCustomer();

      const payload = {
        shop: currentShop,
        customer: {
          id: cust?.id || undefined,
          email: cust?.email || undefined,
          name,
          phone,
          country: targetCountry,
          region: region || undefined,
          province: region || undefined,
          city,
          address: cleanAddress, // Pure street address without duplicating city
          note
        },
        items: orderItems.map(item => ({
          variantId: item.variantId,
          quantity: item.quantity,
          price: item.price, // Exact discounted price!
          originalPrice: item.originalPrice,
          unitDiscount: item.unitDiscount || 0,
          discountTitle: item.discountTitle || ""
        })),
        shippingPrice: currentCalculatedShipping.cost,
        shippingTitle: currentCalculatedShipping.title,
        discountCode: appliedDiscount?.code || "",
        discountAmount: appliedDiscount?.type === "fixed" ? appliedDiscount.amount : undefined,
        discountPercent: appliedDiscount?.type === "percentage" ? appliedDiscount.amount : undefined,
        affiliate: affiliateData,
        paymentMethod: selectedPaymentMethod,
        currency: storeCurrency,
        orderTag: activeConfig?.orderTag || undefined
      };

      const res = await fetch(`${WORKER_URL}/public/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "فشل تسجيل الطلب، يرجى المحاولة لاحقاً.");
      }

      // 1. Electronic Payment Redirect (Wayl / Cards)
      if (data.data?.redirectUrl) {
        if (label) label.textContent = "جاري نقلك لبوابة الدفع الآمنة...";
        try {
          await fetch("/cart/clear.js", { method: "POST" });
        } catch (_) { }
        window.location.href = data.data.redirectUrl;
        return;
      }

      // 2. Standard COD Order
      try {
        await fetch("/cart/clear.js", { method: "POST" });
      } catch (_) { }

      // Redirect to Official Shopify Confirmation or Custom Thank You Page
      let thankYouUrl = data.data?.thankYouUrl;
      if (activeConfig?.enableCustomThankYou) {
        thankYouUrl = activeConfig?.thankYouUrl || `/pages/thank-you?order_id=${data.data?.orderId}&shop=${currentShop}`;
      }
      if (!thankYouUrl) {
        thankYouUrl = data.data?.thankYouUrl || `/pages/thank-you?order_id=${data.data?.orderId}&shop=${currentShop}`;
      }
      window.location.href = thankYouUrl;
    } catch (err) {
      alert(`خطأ: ${err.message}`);
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.style.display = "none";
      if (label) label.textContent = getSubmitButtonLabel();
    }
  }

})();
