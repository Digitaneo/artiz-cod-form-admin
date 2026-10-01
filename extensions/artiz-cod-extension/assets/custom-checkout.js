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

  const WORKER_URL = "https://artiz-cod-form.digitaneo.workers.dev";
  let activeConfig = null;
  let activeShippingConfig = null;
  let orderItems = []; // [{ variantId, title, variantTitle, price, originalPrice, discountAmount, discountTitle, image, quantity }]
  let currentShop = "";
  let appliedDiscount = null;
  let loggedCustomer = null;
  let storeCurrency = "MAD";
  let selectedShippingMethod = null;
  let currentCalculatedShipping = { cost: 0, title: "توصيل سريع لجميع المدن", isFree: false };

  // Regional Locations & Datasets (Loaded modularly per country via window.ARTIZ_LOCATIONS)
  window.ARTIZ_LOCATIONS = window.ARTIZ_LOCATIONS || {};

  const REGIONAL_DATASETS = new Proxy({}, {
    get: function(target, prop) {
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
      } catch (_) {}
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
    } catch (_) {}
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
    } catch (_) {}
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

  // 1. Initialize
  document.addEventListener("DOMContentLoaded", initArtizCOD);

  async function initArtizCOD() {
    const rootEl = document.getElementById("artiz-cod-global-root") || document.getElementById("artiz-cod-form-wrapper");
    currentShop = rootEl?.dataset.shop || window.Shopify?.shop || window.location.hostname;
    storeCurrency = window.Shopify?.currency?.active || "MAD";

    // Load store configuration and shipping settings from Worker
    try {
      const res = await fetch(`${WORKER_URL}/public/form-config?shop=${encodeURIComponent(currentShop)}`);
      const json = await res.json();
      activeConfig = json.data?.formConfig || json.formConfig || getFallbackConfig();
      activeShippingConfig = json.data?.shippingConfig || null;
      if (activeShippingConfig?.shopCurrency) {
        storeCurrency = activeShippingConfig.shopCurrency;
      } else if (window.Shopify?.currency?.active) {
        storeCurrency = window.Shopify.currency.active;
      }
    } catch (e) {
      console.warn("[Artiz COD] Using fallback config:", e);
      activeConfig = getFallbackConfig();
    }

    // Apply primary color if provided
    if (activeConfig.primaryColor) {
      document.documentElement.style.setProperty("--artiz-primary", activeConfig.primaryColor);
    }

    // Ensure active country location dataset is loaded
    const activeCountry = detectActiveCountryCode();
    await ensureCountryLocationsLoaded(activeCountry);

    const isInline = activeConfig.displayMode === "inline_form" || activeConfig.displayMode === "embedded";
    const hasProductTarget = Boolean(document.querySelector('form[action*="/cart/add"]') || document.getElementById("artiz-cod-form-wrapper"));

    if (isInline && hasProductTarget) {
      setupInlineProductForm();
    } else {
      injectModalContainer();
      setupProductPageTrigger();
    }

    // Update block trigger button text if present
    const blockBtn = document.getElementById("artiz-block-trigger-btn");
    if (blockBtn && activeConfig.buttonText) {
      const span = blockBtn.querySelector("span");
      if (span) span.textContent = activeConfig.buttonText;
    }

    setupCartPageTrigger();
  }

  function getFallbackConfig() {
    return {
      displayMode: "popup_modal",
      buttonText: "اشتري الآن - الدفع عند الاستلام",
      formTitle: "إتمام الطلب - الدفع عند الاستلام",
      primaryColor: "#008060",
      enableDiscounts: true,
      enableAffiliateTracking: true,
      enableCartSummary: true,
      directBuyTrigger: true,
      cartDrawerTrigger: true,
      requiredFields: { name: true, phone: true, city: true, address: true, note: false },
      citiesList: ["الدار البيضاء", "الرباط", "مراكش", "فاس", "طنجة", "أكادير", "الرياض", "جدة", "أخرى"]
    };
  }

  // 2. Setup Product Page Trigger (Inline Form vs Modal/Drawer Trigger Buttons)
  function setupProductPageTrigger() {
    if (!activeConfig.directBuyTrigger) return;

    const productForm = document.querySelector('form[action*="/cart/add"]');
    if (!productForm) return;

    const isInline = activeConfig.displayMode === "inline_form" || activeConfig.displayMode === "embedded";
    if (isInline) {
      setupInlineProductForm(productForm);
      return;
    }

    if (document.getElementById("artiz-product-dual-actions")) return;

    const container = document.createElement("div");
    container.id = "artiz-product-dual-actions";
    container.className = "artiz-dual-actions";

    const addCartBtn = document.createElement("button");
    addCartBtn.type = "button";
    addCartBtn.id = "artiz-product-add-cart-btn";
    addCartBtn.className = "artiz-btn artiz-btn-secondary artiz-secondary-btn";
    addCartBtn.innerHTML = `
      <svg class="artiz-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>
      <span id="artiz-add-cart-text">أضف إلى السلة</span>
    `;

    addCartBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      await handleAddToCart(productForm, addCartBtn);
    });

    const buyNowBtn = document.createElement("button");
    buyNowBtn.type = "button";
    buyNowBtn.id = "artiz-direct-buy-btn";
    buyNowBtn.className = "artiz-btn artiz-btn-primary artiz-cod-trigger-btn artiz-pulse";
    buyNowBtn.innerHTML = `
      <svg class="artiz-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
      </svg>
      <span id="artiz-buy-now-text">${activeConfig.buttonText || "اطلب الآن - الدفع عند الاستلام"}</span>
    `;

    buyNowBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      await handleSmartCheckout(productForm);
    });

    container.appendChild(addCartBtn);
    container.appendChild(buyNowBtn);

    const submitBtn = productForm.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn && submitBtn.parentNode) {
      submitBtn.parentNode.insertBefore(container, submitBtn.nextSibling);
    } else {
      productForm.appendChild(container);
    }

    updateProductPageItems(productForm);
    watchVariantChanges(productForm);
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

    // Populate initial product into orderItems and observe variant changes
    if (productForm) {
      updateProductPageItems(productForm);
      watchVariantChanges(productForm);
    }
  }

  function watchVariantChanges(productForm) {
    if (!productForm || productForm._artizVariantWatched) return;
    productForm._artizVariantWatched = true;

    const onVariantChange = () => {
      setTimeout(() => updateProductPageItems(productForm), 60);
    };

    productForm.addEventListener("change", onVariantChange);
    productForm.addEventListener("input", function (e) {
      if (e.target && (e.target.name === "quantity" || e.target.name === "id")) {
        onVariantChange();
      }
    });

    // Global listener for modern theme variant selectors (radios, selects, swatches, pills)
    document.addEventListener("change", function (e) {
      if (e.target && (
        e.target.name === "id" ||
        (e.target.name && e.target.name.startsWith("options[")) ||
        e.target.closest("variant-radios, variant-selects, .variant-picker, .product-form")
      )) {
        onVariantChange();
      }
    });

    // Theme custom events (e.g. Dawn variant:change)
    document.addEventListener("variant:change", onVariantChange);

    // Watch for URL variant changes (?variant=...)
    window.addEventListener("popstate", onVariantChange);
    if (!history._artizVariantPatched) {
      history._artizVariantPatched = true;
      const origPush = history.pushState;
      history.pushState = function () {
        origPush.apply(this, arguments);
        onVariantChange();
      };
      const origReplace = history.replaceState;
      history.replaceState = function () {
        origReplace.apply(this, arguments);
        onVariantChange();
      };
    }

    // Observe hidden variant id attribute mutations
    const variantInput = productForm.querySelector('input[name="id"], select[name="id"]');
    if (variantInput && window.MutationObserver) {
      const observer = new MutationObserver(onVariantChange);
      observer.observe(variantInput, { attributes: true, attributeFilter: ["value"] });
    }
  }

  let showOtherCartItems = false;
  window.artizToggleOtherCartItems = function () {
    showOtherCartItems = !showOtherCartItems;
    renderOrderItemsList();
  };

  async function updateProductPageItems(productForm) {
    if (!productForm) return;
    const variantInput = productForm.querySelector('input[name="id"], select[name="id"]');
    let variantId = variantInput ? variantInput.value : null;
    if (!variantId) {
      const urlParams = new URLSearchParams(window.location.search);
      variantId = urlParams.get("variant");
    }
    const qtyInput = productForm.querySelector('input[name="quantity"]');
    const quantity = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

    let title = document.querySelector("h1")?.innerText?.trim() || "منتج المتجر";
    let catalogPrice = 0;
    let catalogComparePrice = 0;
    let image = "";
    let variantTitle = "";
    let isAvailable = true;

    try {
      const pathname = window.location.pathname;
      const productHandle = pathname.split("/products/")[1]?.split("/")[0]?.split("?")[0];
      if (productHandle) {
        const pRes = await fetch(`/products/${productHandle}.js`);
        const pData = await pRes.json();
        title = pData.title;
        image = pData.featured_image || "";
        const variantObj = pData.variants?.find(v => String(v.id) === String(variantId)) || pData.variants?.[0];
        if (variantObj) {
          variantId = variantObj.id;
          isAvailable = variantObj.available !== false;
          catalogPrice = variantObj.price / 100;
          catalogComparePrice = variantObj.compare_at_price ? (variantObj.compare_at_price / 100) : catalogPrice;
          variantTitle = variantObj.title !== "Default Title" ? variantObj.title : "";
          if (variantObj.featured_image?.src) {
            image = variantObj.featured_image.src;
          }
        }
      }
    } catch (e) {
      console.warn("Could not fetch product details", e);
    }

    if (!variantId) return;

    // Update Storefront Dual Action Buttons according to inventory
    const addCartBtn = document.getElementById("artiz-product-add-cart-btn");
    const buyNowBtn = document.getElementById("artiz-direct-buy-btn");
    const blockTriggerBtn = document.getElementById("artiz-block-trigger-btn");

    if (!isAvailable) {
      if (addCartBtn) {
        addCartBtn.disabled = true;
        addCartBtn.classList.add("artiz-btn-disabled");
        const tSpan = addCartBtn.querySelector("#artiz-add-cart-text") || addCartBtn;
        tSpan.textContent = "نفذ من المخزون";
      }
      if (buyNowBtn) {
        buyNowBtn.disabled = true;
        buyNowBtn.classList.add("artiz-btn-disabled");
        buyNowBtn.classList.remove("artiz-pulse");
        const tSpan = buyNowBtn.querySelector("#artiz-buy-now-text") || buyNowBtn;
        tSpan.textContent = "نفذ من المخزون";
      }
      if (blockTriggerBtn) {
        blockTriggerBtn.disabled = true;
        blockTriggerBtn.classList.add("artiz-btn-disabled");
        blockTriggerBtn.classList.remove("artiz-pulse");
        const span = blockTriggerBtn.querySelector("span") || blockTriggerBtn;
        span.textContent = "نفذ من المخزون";
      }
    } else {
      if (addCartBtn) {
        addCartBtn.disabled = false;
        addCartBtn.classList.remove("artiz-btn-disabled");
        const tSpan = addCartBtn.querySelector("#artiz-add-cart-text") || addCartBtn;
        tSpan.textContent = "أضف إلى السلة";
      }
      if (buyNowBtn) {
        buyNowBtn.disabled = false;
        buyNowBtn.classList.remove("artiz-btn-disabled");
        buyNowBtn.classList.add("artiz-pulse");
        const tSpan = buyNowBtn.querySelector("#artiz-buy-now-text") || buyNowBtn;
        tSpan.textContent = activeConfig?.buttonText || "اطلب الآن - الدفع عند الاستلام";
      }
      if (blockTriggerBtn) {
        blockTriggerBtn.disabled = false;
        blockTriggerBtn.classList.remove("artiz-btn-disabled");
        blockTriggerBtn.classList.add("artiz-pulse");
        const span = blockTriggerBtn.querySelector("span") || blockTriggerBtn;
        span.textContent = activeConfig?.buttonText || "اشتري الآن - الدفع عند الاستلام";
      }
    }

    // Inspect Active Cart Items
    let otherCartItems = [];
    let matchingCartItem = null;

    try {
      const cRes = await fetch("/cart.js");
      const cart = await cRes.json();
      if (cart.currency) storeCurrency = cart.currency;

      if (cart.items && cart.items.length > 0) {
        matchingCartItem = cart.items.find(item => String(item.variant_id) === String(variantId));
        otherCartItems = cart.items
          .filter(item => String(item.variant_id) !== String(variantId))
          .map(item => mapCartItemToOrderItem(item));
      }
    } catch (_) {}

    // Build Current Product with full cart discount awareness and accurate stock status
    let currentProduct;
    if (matchingCartItem) {
      const mapped = mapCartItemToOrderItem(matchingCartItem);
      const effectiveOriginal = catalogComparePrice > mapped.price 
        ? catalogComparePrice 
        : (mapped.originalPrice > mapped.price ? mapped.originalPrice : catalogPrice);

      const hasAutoDiscount = mapped.unitDiscount > 0 || (catalogPrice > mapped.price);
      const autoDiscountPercent = hasAutoDiscount && catalogPrice > 0
        ? Math.round(((catalogPrice - mapped.price) / catalogPrice) * 100)
        : (mapped.cartDiscountPercent || 0);

      currentProduct = {
        ...mapped,
        isCurrentProduct: true,
        catalogPrice,
        catalogComparePrice,
        originalPrice: effectiveOriginal,
        autoDiscountPercent,
        hasAutoDiscount,
        image: mapped.image || image,
        available: isAvailable
      };
    } else {
      currentProduct = {
        variantId,
        title,
        variantTitle,
        price: catalogPrice,
        catalogPrice,
        catalogComparePrice,
        originalPrice: catalogComparePrice > catalogPrice ? catalogComparePrice : catalogPrice,
        unitDiscount: 0,
        autoDiscountPercent: 0,
        hasAutoDiscount: false,
        image,
        quantity,
        isCurrentProduct: true,
        available: isAvailable
      };
    }

    orderItems = [currentProduct, ...otherCartItems];
    renderOrderItemsList();
  }

  async function handleAddToCart(productForm, btn) {
    const textSpan = btn.querySelector("#artiz-add-cart-text") || btn;
    const origText = textSpan ? textSpan.textContent : "أضف إلى السلة";

    // 1. Proactively check if currently selected variant is out of stock
    const currentProduct = orderItems.find(i => i.isCurrentProduct);
    if ((currentProduct && currentProduct.available === false) || btn.disabled) {
      alert("عذراً، هذا الخيار أو المتغير (القياس/اللون) نفذ من المخزون حالياً ولا يمكن إضافته للسلة.");
      return;
    }

    if (textSpan) textSpan.textContent = "جاري الإضافة...";
    btn.disabled = true;

    try {
      const formData = new FormData(productForm);
      const res = await fetch("/cart/add.js", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.description || errJson.message || "عذراً، نفذت كمية هذا المنتج من المخزون.";
        alert(errMsg);
        if (textSpan) textSpan.textContent = "نفذ من المخزون";
        btn.disabled = true;
        btn.classList.add("artiz-btn-disabled");
        return;
      }

      if (textSpan) textSpan.textContent = "تمت الإضافة بنجاح ✓";
      setTimeout(() => {
        if (textSpan) textSpan.textContent = origText;
        btn.disabled = false;
      }, 1500);

      const countBadges = document.querySelectorAll('.cart-count-bubble, [data-cart-count], .cart-count');
      countBadges.forEach(b => {
        const current = parseInt(b.textContent, 10) || 0;
        b.textContent = current + 1;
      });
    } catch (e) {
      alert("تعذر إضافة المنتج للسلة، يرجى المحاولة لاحقاً.");
      if (textSpan) textSpan.textContent = origText;
      btn.disabled = false;
    }
  }

  async function handleSmartCheckout(productForm) {
    await handleDirectProductBuy(productForm);
  }

  async function handleDirectProductBuy(productForm) {
    const variantInput = productForm.querySelector('input[name="id"], select[name="id"]');
    let variantId = variantInput ? variantInput.value : null;
    if (!variantId) {
      const urlParams = new URLSearchParams(window.location.search);
      variantId = urlParams.get("variant");
    }
    const qtyInput = productForm.querySelector('input[name="quantity"]');
    const quantity = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

    let currentProduct = null;

    if (variantId) {
      let title = document.querySelector("h1")?.innerText?.trim() || "منتج المتجر";
      let price = 0;
      let originalPrice = 0;
      let image = "";
      let variantTitle = "";
      let isAvailable = true;

      try {
        const pathname = window.location.pathname;
        const productHandle = pathname.split("/products/")[1]?.split("/")[0]?.split("?")[0];
        if (productHandle) {
          const pRes = await fetch(`/products/${productHandle}.js`);
          const pData = await pRes.json();
          title = pData.title;
          image = pData.featured_image || "";
          const variantObj = pData.variants?.find(v => String(v.id) === String(variantId)) || pData.variants?.[0];
          if (variantObj) {
            isAvailable = variantObj.available !== false;
            price = variantObj.price / 100;
            originalPrice = variantObj.compare_at_price ? (variantObj.compare_at_price / 100) : price;
            variantTitle = variantObj.title !== "Default Title" ? variantObj.title : "";
            if (variantObj.featured_image?.src) {
              image = variantObj.featured_image.src;
            }
          }
        }
      } catch (e) {
        console.warn("Could not fetch product details", e);
      }

      if (!isAvailable) {
        alert("عذراً، هذا المنتج أو المتغير (القياس/اللون) نفذ من المخزون حالياً ولا يمكن طلبه.");
        return;
      }

      currentProduct = {
        variantId,
        title,
        variantTitle,
        price,
        originalPrice: originalPrice > price ? originalPrice : price,
        image,
        quantity,
        available: isAvailable,
        isCurrentProduct: true
      };
    }

    // Inspect Cart
    try {
      const cRes = await fetch("/cart.js");
      const cart = await cRes.json();
      if (cart.currency) storeCurrency = cart.currency;

      if (cart.items && cart.items.length > 0) {
        orderItems = cart.items.map(item => mapCartItemToOrderItem(item));

        if (currentProduct && !orderItems.some(i => String(i.variantId) === String(currentProduct.variantId))) {
          orderItems.unshift(currentProduct);
        }
      } else if (currentProduct) {
        orderItems = [currentProduct];
      }
    } catch (_) {
      if (currentProduct) orderItems = [currentProduct];
    }

    if (orderItems.length === 0) {
      alert("يرجى اختيار منتج لشرائه.");
      return;
    }

    openArtizModal();
  }

  // 3. Setup Cart Page Trigger
  function setupCartPageTrigger() {
    if (!activeConfig.cartDrawerTrigger) return;
    if (window.location.pathname.includes("/products/")) return;

    const cartForms = document.querySelectorAll('form[action="/cart"], form[action*="/cart?"]');
    cartForms.forEach(cartForm => {
      if (cartForm.querySelector(".artiz-cart-cod-btn")) return;

      const checkoutBtn = cartForm.querySelector('[name="checkout"], input[type="submit"][value*="checkout" i], button[type="submit"]');
      if (!checkoutBtn) return;

      const codCartBtn = document.createElement("button");
      codCartBtn.type = "button";
      codCartBtn.className = "artiz-cod-trigger-btn artiz-cart-cod-btn";
      codCartBtn.innerHTML = `<span>إتمام الطلب - الدفع عند الاستلام</span>`;

      codCartBtn.addEventListener("click", async function (e) {
        e.preventDefault();
        await handleCartCheckout();
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
    let changed = false;

    orderItems.forEach(item => {
      const match = cart.items.find(ci => String(ci.variant_id) === String(item.variantId));
      if (match) {
        const mapped = mapCartItemToOrderItem(match);
        if (item.price !== mapped.price || item.unitDiscount !== mapped.unitDiscount || item.quantity !== match.quantity) {
          item.price = mapped.price;
          item.unitDiscount = mapped.unitDiscount;
          item.discountTitle = mapped.discountTitle;
          item.cartDiscountPercent = mapped.cartDiscountPercent;
          if (item.isCurrentProduct && item.catalogPrice) {
            item.hasAutoDiscount = item.catalogPrice > mapped.price;
            item.autoDiscountPercent = item.hasAutoDiscount 
              ? Math.round(((item.catalogPrice - mapped.price) / item.catalogPrice) * 100)
              : 0;
          }
          changed = true;
        }
      }
    });

    if (changed) {
      renderOrderItemsList();
    }
  }

  async function handleCartCheckout() {
    try {
      const res = await fetch("/cart.js");
      const cart = await res.json();
      if (cart.currency) storeCurrency = cart.currency;

      if (!cart.items || cart.items.length === 0) {
        alert("سلة التسوق فارغة، يرجى إضافة منتجات أولاً.");
        return;
      }

      orderItems = cart.items.map(item => mapCartItemToOrderItem(item));
      openArtizModal();
    } catch (e) {
      alert("تعذر قراءة بيانات السلة، يرجى المحاولة لاحقاً.");
    }
  }

  // 4. In-Modal / In-Form Quantity Management & Background Cart Sync
  window.artizUpdateQty = function (index, delta) {
    if (!orderItems[index]) return;
    const item = orderItems[index];
    item.quantity += delta;
    if (item.quantity <= 0) {
      if (item.isCurrentProduct) {
        item.quantity = 1;
        return;
      }
      orderItems.splice(index, 1);
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
      }).catch(() => {});
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
      }).catch(() => {});
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
          <h3>${activeConfig.formTitle || "إتمام الطلب - الدفع عند الاستلام"}</h3>
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

          ${activeConfig.addressMode === "cascading" ? `
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

          <button type="submit" id="artiz-submit-order-btn" class="artiz-submit-button">
            <span id="artiz-btn-spinner" class="artiz-spinner" style="display:none;"></span>
            <span id="artiz-btn-label">${activeConfig.buttonText || "تأكيد الطلب الآن (الدفع عند الاستلام)"}</span>
          </button>
        </form>
      </div>
    `;
  }

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
    if (activeConfig.addressMode === "cascading") {
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

    renderOrderItemsList();
    const overlay = document.getElementById("artiz-modal-overlay");
    if (overlay) overlay.classList.add("artiz-active");
  }

  function closeArtizModal() {
    const overlay = document.getElementById("artiz-modal-overlay");
    if (overlay) overlay.classList.remove("artiz-active");
  }

  window.artizOpenModal = async function () {
    if (orderItems.length === 0) {
      const productForm = document.querySelector('form[action*="/cart/add"]');
      if (productForm) {
        await handleDirectProductBuy(productForm);
        return;
      }
    }
    openArtizModal();
  };
  window.artizCloseModal = closeArtizModal;

  // 6. Render Items List & Recalculate Totals
  function renderOrderItemsList() {
    const container = document.getElementById("artiz-items-render-list");
    const summaryLines = document.getElementById("artiz-summary-lines");
    const freeShippingContainer = document.getElementById("artiz-free-shipping-container");
    if (!container || !summaryLines) return;

    if (orderItems.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:#94a3b8; font-size:14px; margin:20px 0;">السلة فارغة</p>`;
      summaryLines.innerHTML = "";
      if (freeShippingContainer) freeShippingContainer.innerHTML = "";
      document.getElementById("artiz-submit-order-btn").disabled = true;
      return;
    }

    document.getElementById("artiz-submit-order-btn").disabled = false;

    // Render items with compare-at price & discount badges
    const currentProduct = orderItems.find(i => i.isCurrentProduct);
    const otherItems = orderItems.filter(i => !i.isCurrentProduct);

    if (currentProduct && otherItems.length > 0) {
      const currentIdx = orderItems.indexOf(currentProduct);
      const hasDiscount = currentProduct.originalPrice && currentProduct.originalPrice > currentProduct.price;
      const discountPercent = hasDiscount ? Math.round((1 - (currentProduct.price / currentProduct.originalPrice)) * 100) : 0;
      const autoDiscPercent = currentProduct.autoDiscountPercent || currentProduct.cartDiscountPercent || (currentProduct.unitDiscount > 0 && currentProduct.originalPrice > 0 ? Math.round((currentProduct.unitDiscount / currentProduct.originalPrice) * 100) : 0);
      const otherTotal = otherItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

      container.innerHTML = `
        <div class="artiz-item-card">
          ${currentProduct.image ? `<img src="${currentProduct.image}" alt="${currentProduct.title}" class="artiz-item-thumb">` : ""}
          <div class="artiz-item-info">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:2px;">
              <p class="artiz-item-title" style="margin:0;">${currentProduct.title}</p>
              ${currentProduct.available === false ? `<span class="artiz-stock-out-badge">نفذ من المخزون</span>` : ""}
              ${autoDiscPercent > 0 ? `<span class="artiz-discount-tag artiz-auto-discount-badge">-${autoDiscPercent}%</span>` : ""}
            </div>
            ${currentProduct.variantTitle ? `<p class="artiz-item-variant">${currentProduct.variantTitle}</p>` : ""}
            <div class="artiz-price-stack">
              <span class="artiz-item-price">${(currentProduct.price * currentProduct.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
              ${hasDiscount ? `
                <span class="artiz-item-compare-price">${(currentProduct.originalPrice * currentProduct.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
                <span class="artiz-discount-tag">خصم ${discountPercent}%</span>
              ` : ""}
            </div>
            <span class="artiz-current-product-tag">المنتج الحالي المعروض</span>
          </div>
          <div class="artiz-stepper">
            <button type="button" onclick="artizUpdateQty(${currentIdx}, -1)">-</button>
            <span>${currentProduct.quantity}</span>
            <button type="button" onclick="artizUpdateQty(${currentIdx}, 1)">+</button>
          </div>
        </div>

        <div class="artiz-other-cart-section">
          <button type="button" class="artiz-other-cart-toggle" onclick="window.artizToggleOtherCartItems()">
            <div class="artiz-cart-toggle-right">
              <span class="artiz-cart-badge-icon">🛒</span>
              <strong class="artiz-cart-toggle-label">منتجات أخرى في سلتك (${otherItems.length})</strong>
            </div>
            <div class="artiz-cart-toggle-left">
              <span class="artiz-other-cart-sum">${otherTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${storeCurrency}</span>
              <span class="artiz-other-cart-chevron">${showOtherCartItems ? '▲ إخفاء' : '▼ إظهار وتعديل'}</span>
            </div>
          </button>
          
          <div class="artiz-other-cart-list" style="${showOtherCartItems ? 'display:flex;' : 'display:none;'}">
            ${otherItems.map(item => {
              const idx = orderItems.indexOf(item);
              const itemDiscount = item.originalPrice && item.originalPrice > item.price;
              const itemDiscPercent = itemDiscount ? Math.round((1 - (item.price / item.originalPrice)) * 100) : 0;
              const itemAutoPercent = item.cartDiscountPercent || itemDiscPercent;

              return `
                <div class="artiz-item-card artiz-sub-item-card">
                  ${item.image ? `<img src="${item.image}" alt="${item.title}" class="artiz-item-thumb">` : ""}
                  <div class="artiz-item-info">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:2px;">
                      <p class="artiz-item-title" style="margin:0;">${item.title}</p>
                      ${item.available === false ? `<span class="artiz-stock-out-badge">نفذ من المخزون</span>` : ""}
                      ${itemAutoPercent > 0 ? `<span class="artiz-discount-tag artiz-auto-discount-badge">-${itemAutoPercent}%</span>` : ""}
                    </div>
                    ${item.variantTitle ? `<p class="artiz-item-variant">${item.variantTitle}</p>` : ""}
                    <div class="artiz-price-stack">
                      <span class="artiz-item-price">${(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
                      ${itemDiscount ? `
                        <span class="artiz-item-compare-price">${(item.originalPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
                      ` : ""}
                    </div>
                  </div>
                  <div class="artiz-stepper">
                    <button type="button" onclick="artizUpdateQty(${idx}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button type="button" onclick="artizUpdateQty(${idx}, 1)">+</button>
                  </div>
                  <button type="button" class="artiz-item-remove" onclick="artizRemoveItem(${idx})" title="حذف من السلة">✕</button>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    } else {
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
                <span class="artiz-item-price">${(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
                ${hasDiscount ? `
                  <span class="artiz-item-compare-price">${(item.originalPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
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
    }

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
      defaultTitle: "توصيل سريع لجميع المدن",
      defaultRate: 30,
      freeShippingEnabled: true,
      freeShippingThreshold: 90800,
      freeShippingText: "مجاناً (توصيل سريع)",
      allowMultipleMethods: true,
      defaultMethods: [
        { id: "home", title: "توصيل للمنزل (سريع)", price: 30 },
        { id: "desk", title: "استلام من مكتب التوزيع (Stop Desk)", price: 20 }
      ]
    };

    const threshold = Number(shippingGen.freeShippingThreshold || 0);
    const isFreeShipping = shippingGen.freeShippingEnabled && threshold > 0 && subtotal >= threshold;

    let shippingCost = 0;
    let shippingTitle = shippingGen.defaultTitle || "توصيل سريع لجميع المدن";
    let shippingMethodsHtml = "";

    if (isFreeShipping) {
      shippingCost = 0;
      shippingTitle = shippingGen.freeShippingText || "مجاناً (توصيل مجاني)";
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
      if (freeShippingContainer && threshold > 0) {
        const remaining = Math.max(0, threshold - subtotal);
        const percent = Math.min(100, Math.round((subtotal / threshold) * 100));
        freeShippingContainer.innerHTML = `
          <div class="artiz-free-shipping-bar">
            <div class="artiz-shipping-msg">
              أضف بقيمة <strong>${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</strong> إضافية للحصول على <strong>شحن مجاني!</strong>
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
        if (activeConfig.addressMode === "cascading") {
          cityVal = (document.getElementById("artiz-input-city")?.value || "").trim().toLowerCase();
          regionVal = (document.getElementById("artiz-input-region")?.value || "").trim().toLowerCase();
        } else {
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

        const matchedRate = activeShippingConfig.rates.find(r => {
          if (cityVal && (r.city || "").trim().toLowerCase() === cityVal) return true;
          if (regionVal && (r.region || "").trim().toLowerCase() === regionVal && !r.city) return true;
          return false;
        });

        if (matchedRate) {
          if (matchedRate.customRates && String(matchedRate.customRates).includes(":")) {
            methods = String(matchedRate.customRates).split("|").map((p, idx) => {
              const [t, pr] = p.split(":");
              return { id: `custom_${idx}`, title: t.trim(), price: Number(pr.trim() || 0) };
            });
          } else if (matchedRate.cost !== undefined && matchedRate.cost !== null) {
            methods = [{ id: "standard", title: matchedRate.deliveryMethod || matchedRate.title || shippingGen.defaultTitle || "توصيل قياسي", price: Number(matchedRate.cost) }];
          }
        }
      }

      if (!methods || methods.length === 0) {
        methods = shippingGen.defaultMethods || [
          { id: "home", title: shippingGen.defaultTitle || "توصيل سريع للمنزل", price: Number(shippingGen.defaultRate || 30) }
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
                <strong>${m.price.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${storeCurrency}</strong>
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
        <span class="artiz-subtotal-val">${(originalSubtotal > subtotal ? originalSubtotal : subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
      </div>

      ${totalSavings > 0 ? `
        <div class="artiz-summary-row artiz-savings-row">
          <span>إجمالي التوفير والخصم:</span>
          <span class="artiz-savings-badge">وفرت -${totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
        </div>
      ` : ""}

      <div class="artiz-summary-row artiz-shipping-row">
        <div class="artiz-shipping-label-group">
          <span>الشحن والتوصيل:</span>
          <small class="artiz-shipping-title">${shippingTitle}</small>
        </div>
        <span class="artiz-shipping-cost ${shippingCost === 0 ? 'artiz-text-free' : ''}">
          ${shippingCost === 0 ? 'مجاناً' : `${shippingCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${storeCurrency}`}
        </span>
      </div>

      ${shippingMethodsHtml}

      <div class="artiz-summary-row artiz-total-row">
        <span>المجموع الكلي للدفع:</span>
        <span class="artiz-total-val">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
      </div>
    `;

    // Check if any order item is sold out and block the submit button
    const hasSoldOut = orderItems.some(i => i.available === false);
    const submitBtn = document.getElementById("artiz-submit-order-btn");
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
    const isCascading = activeConfig.addressMode === "cascading";
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
    } catch (_) {}

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
    if (label) label.textContent = "جاري تأكيد وتسجيل طلبك...";

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
        affiliate: affiliateData
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

      // Order created successfully! Clear cart
      try {
        await fetch("/cart/clear.js", { method: "POST" });
      } catch (_) {}

      // Redirect to Shopify Order Confirmation Thank You Page
      const thankYouUrl = data.data?.thankYouUrl || `/pages/thank-you?order_id=${data.data?.orderId}&shop=${currentShop}`;
      window.location.href = thankYouUrl;
    } catch (err) {
      alert(`خطأ: ${err.message}`);
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.style.display = "none";
      if (label) label.textContent = activeConfig.buttonText || "تأكيد الطلب الآن (الدفع عند الاستلام)";
    }
  }

})();
