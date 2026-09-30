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

  // Built-in Regional Cascading Datasets
  const REGIONAL_DATASETS = {
    "MA": {
      name: "المغرب",
      currency: "MAD",
      defaultRegion: "جهة الدار البيضاء - سطات",
      regions: {
        "جهة الدار البيضاء - سطات": ["الدار البيضاء", "المحمدية", "سطات", "برشيد", "الجديدة", "بنسليمان", "سيدي بنور"],
        "جهة الرباط - سلا - القنيطرة": ["الرباط", "سلا", "القنيطرة", "تمارة", "الصخيرات", "الخميسات", "سيدي قاسم", "سيدي سليمان"],
        "جهة مراكش - آسفي": ["مراكش", "آسفي", "الصويرة", "قلعة السراغنة", "ابن جرير", "شيشاوة", "الحوز"],
        "جهة طنجة - تطوان - الحسيمة": ["طنجة", "تطوان", "العرائش", "القصر الكبير", "الحسيمة", "شفشاون", "وزان", "المضيق - الفنيدق"],
        "جهة فاس - مكناس": ["فاس", "مكناس", "تازة", "صفرو", "إفران", "تاونات", "الحاجب", "بولمان"],
        "جهة سوس - ماسة": ["أكادير", "إنزكان - آيت ملول", "تارودانت", "أولاد تايمة", "تيزنيت", "بيوكرى", "طاطا"],
        "جهة الشرق": ["وجدة", "الناظور", "بركان", "تاوريرت", "جرسيف", "الدريوش", "جرادة", "بوعرفة - فكيك"],
        "جهة بني ملال - خنيفرة": ["بني ملال", "خريبكة", "وادي زم", "خنيفرة", "الفقيه بن صالح", "أزيلال"],
        "جهة درعة - تافيلالت": ["الرشيدية", "ورزازات", "ميدلت", "تنغير", "زاكورة"],
        "الأقاليم الجنوبية": ["العيون", "الداخلة", "كلميم", "طانطان", "بوجدور", "السمارة", "طرفاية", "أسا الزاك"]
      }
    },
    "DZ": {
      name: "الجزائر",
      currency: "DZD",
      defaultRegion: "16 الجزائر العاصمة",
      regions: {
        "16 الجزائر العاصمة": ["الجزائر الوسطى", "باب الوادي", "الحراش", "بئر مراد رايس", "الرويبة", "زرالدة", "الشراقة", "الدرارية", "باب الزوار", "حسين داي", "بئر خادم"],
        "31 وهران": ["وهران", "السانية", "عين الترك", "أرزيو", "بطيوة", "قديل", "بئر الجير"],
        "25 قسنطينة": ["قسنطينة", "الخروب", "عين سمارة", "زيغود يوسف", "حامة بوزيان"],
        "19 سطيف": ["سطيف", "العلمة", "عين ولمان", "بوقاعة", "عين الكبيرة"],
        "09 البليدة": ["البليدة", "بوفاريك", "العفرون", "أولاد يعيش", "موزاية"],
        "15 تيزي وزو": ["تيزي وزو", "عزازقة", "ذراع الميزان", "لاربعا ناث إيراثن"],
        "06 بجاية": ["بجاية", "أقبو", "أميزور", "سيدي عيش", "خراطة"],
        "13 تلمسان": ["تلمسان", "مغنية", "منصورة", "الرمشي", "سبدو"],
        "23 عنابة": ["عنابة", "البوني", "سيدي عمار", "برحال", "عين الباردة"],
        "01 أدرار": ["أدرار", "تيميمون", "أولف", "زاوية كنتة", "فنوغيل"],
        "02 الشلف": ["الشلف", "تنس", "بوقادير", "واد الفضة", "أولاد فارس"],
        "03 الأغواط": ["الأغواط", "أفلو", "حاسي الرمل", "قصر الحيران"],
        "04 أم البواقي": ["أم البواقي", "عين البيضاء", "عين مليلة", "مسكيانة"],
        "05 باتنة": ["باتنة", "بريكة", "عين التوتة", "مروانة", "أريس"],
        "07 بسكرة": ["بسكرة", "طولقة", "سيدي عقبة", "أولاد جلال", "الوطاية"],
        "08 بشار": ["بشار", "العبادلة", "بني عباس", "القنادسة"],
        "10 البويرة": ["البويرة", "الأخضرية", "سور الغزلان", "عين بسام"],
        "11 تمنراست": ["تمنراست", "عين صالح", "إين غزام"],
        "12 تبسة": ["تبسة", "بئر العاتر", "الشريعة", "الونزة"],
        "14 تيارت": ["تيارت", "السوقر", "فرندة", "قصر الشلالة"],
        "17 الجلفة": ["الجلفة", "عين وسارة", "مسعد", "حاسي بحبح"],
        "18 جيجل": ["جيجل", "طاهير", "الميلية", "العوانة"],
        "20 سعيدة": ["سعيدة", "يوب", "عين الحجر"],
        "21 سكيكدة": ["سكيكدة", "القل", "عزابة", "الحروش"],
        "22 سيدي بلعباس": ["سيدي بلعباس", "تلاغ", "سفيزف", "ابن باديس"],
        "24 قالمة": ["قالمة", "وادي الزناتي", "بوشقوف", "هيليوبوليس"],
        "26 المدية": ["المدية", "البرواقية", "قصر البخاري", "بني سليمان"],
        "27 مستغانم": ["مستغانم", "سيدي علي", "عين تادلس", "خير الدين"],
        "28 المسيلة": ["المسيلة", "بوسعادة", "سيدي عيسى", "مقرة"],
        "29 معسكر": ["معسكر", "سيق", "المحمدية", "تغنيف"],
        "30 ورقلة": ["ورقلة", "تقرت", "حاسي مسعود", "الطيبات"]
      }
    },
    "SA": {
      name: "السعودية",
      currency: "SAR",
      defaultRegion: "منطقة الرياض",
      regions: {
        "منطقة الرياض": ["الرياض", "الخرج", "الدرعية", "الدوادمي", "المجمعة", "وادي الدواسر", "الزلفي"],
        "منطقة مكة المكرمة": ["مكة المكرمة", "جدة", "الطائف", "رابغ", "القنفذة", "الليث"],
        "المنطقة الشرقية": ["الدمام", "الخبر", "الظهران", "الأحساء", "الجبيل", "القطيف", "حفر الباطن"],
        "منطقة المدينة المنورة": ["المدينة المنورة", "ينبع", "العلا", "بدر", "خيبر"],
        "منطقة القصيم": ["بريدة", "عنيزة", "الرس", "البكيرية", "المذنب"],
        "منطقة عسير": ["أبها", "خميس مشيط", "أحد رفيدة", "بيشة", "محايل عسير"]
      }
    }
  };

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
    addCartBtn.className = "artiz-secondary-btn";
    addCartBtn.innerHTML = `<span id="artiz-add-cart-text">أضف إلى السلة</span>`;

    addCartBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      await handleAddToCart(productForm, addCartBtn);
    });

    const buyNowBtn = document.createElement("button");
    buyNowBtn.type = "button";
    buyNowBtn.id = "artiz-direct-buy-btn";
    buyNowBtn.className = "artiz-cod-trigger-btn artiz-pulse";
    buyNowBtn.innerHTML = `<span id="artiz-buy-now-text">${activeConfig.buttonText || "اطلب الآن - الدفع عند الاستلام"}</span>`;

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

    // Populate initial product into orderItems
    if (productForm) {
      updateProductPageItems(productForm);

      // Watch for variant / qty changes in product form
      productForm.addEventListener("change", function () {
        setTimeout(() => updateProductPageItems(productForm), 80);
      });
      productForm.addEventListener("input", function (e) {
        if (e.target && e.target.name === "quantity") {
          setTimeout(() => updateProductPageItems(productForm), 50);
        }
      });
    }
  }

  let showOtherCartItems = false;
  window.artizToggleOtherCartItems = function () {
    showOtherCartItems = !showOtherCartItems;
    renderOrderItemsList();
  };

  async function updateProductPageItems(productForm) {
    const variantInput = productForm.querySelector('input[name="id"], select[name="id"]');
    const variantId = variantInput ? variantInput.value : null;
    const qtyInput = productForm.querySelector('input[name="quantity"]');
    const quantity = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

    if (!variantId) return;

    let title = document.querySelector("h1")?.innerText?.trim() || "منتج المتجر";
    let price = 0;
    let originalPrice = 0;
    let image = "";
    let variantTitle = "";

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

    const currentProduct = {
      variantId,
      title,
      variantTitle,
      price,
      originalPrice: originalPrice > price ? originalPrice : price,
      unitDiscount: 0,
      image,
      quantity,
      isCurrentProduct: true
    };

    // Load active cart items
    let otherCartItems = [];
    try {
      const cRes = await fetch("/cart.js");
      const cart = await cRes.json();
      if (cart.currency) storeCurrency = cart.currency;

      if (cart.items && cart.items.length > 0) {
        otherCartItems = cart.items
          .filter(item => String(item.variant_id) !== String(variantId))
          .map(item => mapCartItemToOrderItem(item));
      }
    } catch (_) {}

    orderItems = [currentProduct, ...otherCartItems];
    renderOrderItemsList();
  }

  async function handleAddToCart(productForm, btn) {
    const textSpan = btn.querySelector("#artiz-add-cart-text");
    const origText = textSpan ? textSpan.textContent : "أضف إلى السلة";

    if (textSpan) textSpan.textContent = "جاري الإضافة...";
    btn.disabled = true;

    try {
      const formData = new FormData(productForm);
      await fetch("/cart/add.js", {
        method: "POST",
        body: formData
      });

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
    const variantId = variantInput ? variantInput.value : null;
    const qtyInput = productForm.querySelector('input[name="quantity"]');
    const quantity = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

    let currentProduct = null;

    if (variantId) {
      let title = document.querySelector("h1")?.innerText?.trim() || "منتج المتجر";
      let price = 0;
      let originalPrice = 0;
      let image = "";
      let variantTitle = "";

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

      currentProduct = {
        variantId,
        title,
        variantTitle,
        price,
        originalPrice: originalPrice > price ? originalPrice : price,
        image,
        quantity
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

    return {
      variantId: item.variant_id,
      title: item.product_title || item.title,
      variantTitle: item.variant_title || "",
      originalPrice: origPrice > finalPrice ? origPrice : finalPrice,
      price: finalPrice, // The actual payable unit price!
      unitDiscount: Number(unitDiscount.toFixed(2)),
      discountAmount,
      discountTitle,
      image: item.image || item.featured_image?.url || "",
      quantity: item.quantity
    };
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
      orderItems.splice(index, 1);
    }
    renderOrderItemsList();

    // Background sync to Shopify cart if this was a cart item
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
        const countBadges = document.querySelectorAll('.cart-count-bubble, [data-cart-count], .cart-count');
        countBadges.forEach(b => {
          b.textContent = cart.item_count || 0;
        });
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
      }).catch(() => {});
    }
  };

  // 5. Generate Checkout Form HTML (Unified for Modal, Drawer and Inline Embedded Mode)
  function generateFormInnerHtml(isInline = false) {
    const defaultCountry = activeConfig.defaultCountry || "MA";
    const countryData = REGIONAL_DATASETS[defaultCountry] || REGIONAL_DATASETS["MA"];
    const regionNames = Object.keys(countryData.regions);

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
              <input type="tel" id="artiz-input-phone" required placeholder="مثال: 06xxxxxxxx أو 05xxxxxxxx" value="${getLoggedCustomer()?.phone || ""}">
            </div>
          ` : ""}

          ${activeConfig.addressMode === "cascading" ? `
            <!-- Cascading Location Selector (Region -> City) -->
            <div class="artiz-location-grid">
              <div class="artiz-field-group">
                <label>الولاية / الجهة *</label>
                <select id="artiz-input-region" required>
                  ${regionNames.map(r => `<option value="${r}">${r}</option>`).join("")}
                  <option value="other">أخرى...</option>
                </select>
              </div>

              <div class="artiz-field-group">
                <label>المدينة / البلدية *</label>
                <select id="artiz-input-city" required>
                  <!-- Populated dynamically on region change -->
                </select>
              </div>
            </div>
          ` : `
            <!-- Standard Mode: Cities list dropdown configured in Form Builder -->
            ${activeConfig.requiredFields?.city !== false ? `
              <div class="artiz-field-group">
                <label>المدينة / المنطقة *</label>
                <select id="artiz-input-city" required>
                  <option value="">اختر مدينتك...</option>
                  ${(activeConfig.citiesList || ["الدار البيضاء", "الرباط", "مراكش", "فاس", "طنجة", "أكادير", "أخرى"])
                    .map(c => `<option value="${c}" ${getLoggedCustomer()?.city === c ? "selected" : ""}>${c}</option>`).join("")}
                  ${getLoggedCustomer()?.city && !(activeConfig.citiesList || []).includes(getLoggedCustomer().city) 
                    ? `<option value="${getLoggedCustomer().city}" selected>${getLoggedCustomer().city}</option>` 
                    : ""}
                </select>
              </div>
            ` : ""}
          `}

          ${activeConfig.requiredFields?.address !== false ? `
            <div class="artiz-field-group">
              <label>العنوان التفصيلي (الحي، الشارع، المعلم) *</label>
              <textarea id="artiz-input-address" required placeholder="اكتب اسم الحي والشارع ورقم البناية">${getLoggedCustomer()?.address || ""}</textarea>
            </div>
          ` : ""}

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

    // City and Region change events
    const citySelect = document.getElementById("artiz-input-city");
    if (citySelect) {
      citySelect.addEventListener("change", function () {
        renderOrderItemsList();
      });
    }

    if (activeConfig.addressMode === "cascading") {
      const regionSelect = document.getElementById("artiz-input-region");
      if (regionSelect && citySelect) {
        regionSelect.addEventListener("change", function () {
          populateCityDropdown(regionSelect.value);
          renderOrderItemsList();
        });
        populateCityDropdown(regionSelect.value);
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

    const defaultCountry = activeConfig.defaultCountry || "MA";
    const countryData = REGIONAL_DATASETS[defaultCountry] || REGIONAL_DATASETS["MA"];
    const cities = countryData.regions[selectedRegion] || activeConfig.citiesList || ["الدار البيضاء", "الرباط", "مراكش", "أخرى"];

    citySelect.innerHTML = cities.map(c => `<option value="${c}">${c}</option>`).join("");
    citySelect.innerHTML += `<option value="other">مدينة أخرى...</option>`;

    // If customer had an existing city, pre-select it
    const custCity = getLoggedCustomer()?.city;
    if (custCity) {
      const match = Array.from(citySelect.options).find(o => o.value === custCity);
      if (match) citySelect.value = custCity;
    }
  }

  function openArtizModal() {
    if (!document.getElementById("artiz-modal-overlay")) {
      injectModalContainer();
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
      const otherTotal = otherItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

      container.innerHTML = `
        <div class="artiz-item-card">
          ${currentProduct.image ? `<img src="${currentProduct.image}" alt="${currentProduct.title}" class="artiz-item-thumb">` : ""}
          <div class="artiz-item-info">
            <p class="artiz-item-title">${currentProduct.title}</p>
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
            <div class="artiz-cart-toggle-left">
              <span class="artiz-cart-badge-icon">🛒</span>
              <span>منتجات أخرى في سلتك (${otherItems.length})</span>
            </div>
            <div class="artiz-cart-toggle-right">
              <span class="artiz-other-cart-sum">${otherTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${storeCurrency}</span>
              <span class="artiz-other-cart-chevron">${showOtherCartItems ? '▲ إخفاء' : '▼ إظهار وتعديل'}</span>
            </div>
          </button>
          
          <div class="artiz-other-cart-list" style="${showOtherCartItems ? 'display:flex;' : 'display:none;'}">
            ${otherItems.map(item => {
              const idx = orderItems.indexOf(item);
              const itemDiscount = item.originalPrice && item.originalPrice > item.price;
              const itemDiscPercent = itemDiscount ? Math.round((1 - (item.price / item.originalPrice)) * 100) : 0;

              return `
                <div class="artiz-item-card artiz-sub-item-card">
                  ${item.image ? `<img src="${item.image}" alt="${item.title}" class="artiz-item-thumb">` : ""}
                  <div class="artiz-item-info">
                    <p class="artiz-item-title">${item.title}</p>
                    ${item.variantTitle ? `<p class="artiz-item-variant">${item.variantTitle}</p>` : ""}
                    <div class="artiz-price-stack">
                      <span class="artiz-item-price">${(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
                      ${itemDiscount ? `
                        <span class="artiz-item-compare-price">${(item.originalPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
                        <span class="artiz-discount-tag">خصم ${itemDiscPercent}%</span>
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

        return `
          <div class="artiz-item-card">
            ${item.image ? `<img src="${item.image}" alt="${item.title}" class="artiz-item-thumb">` : ""}
            <div class="artiz-item-info">
              <p class="artiz-item-title">${item.title}</p>
              ${item.variantTitle ? `<p class="artiz-item-variant">${item.variantTitle}</p>` : ""}
              <div class="artiz-price-stack">
                <span class="artiz-item-price">${(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
                ${hasDiscount ? `
                  <span class="artiz-item-compare-price">${(item.originalPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${storeCurrency}</span>
                  <span class="artiz-discount-tag">خصم ${discountPercent}% ${item.discountTitle ? `(${item.discountTitle})` : ''}</span>
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

      // Methods options: match regional custom rates first
      let methods = null;
      if (activeShippingConfig?.rates && Array.isArray(activeShippingConfig.rates)) {
        const cityVal = (document.getElementById("artiz-input-city")?.value || "").trim().toLowerCase();
        const regionVal = (document.getElementById("artiz-input-region")?.value || "").trim().toLowerCase();

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
            methods = [{ id: "standard", title: matchedRate.title || shippingGen.defaultTitle || "توصيل قياسي", price: Number(matchedRate.cost) }];
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

    const name = document.getElementById("artiz-input-name")?.value.trim() || "عميل المتجر";
    const phone = document.getElementById("artiz-input-phone")?.value.trim() || "";
    const isCascading = activeConfig.addressMode === "cascading";
    const region = isCascading ? (document.getElementById("artiz-input-region")?.value.trim() || "") : "";
    const city = document.getElementById("artiz-input-city")?.value.trim() || "الدار البيضاء";
    const address = document.getElementById("artiz-input-address")?.value.trim() || "العنوان بالمتجر";
    const note = document.getElementById("artiz-input-note")?.value.trim() || "";

    if (!phone || !address) {
      alert("يرجى ملء جميع الحقول الإلزامية.");
      return;
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
      const defaultCountry = activeConfig.defaultCountry === "DZ" ? "Algeria" : "Morocco";

      const payload = {
        shop: currentShop,
        customer: {
          id: cust?.id || undefined,
          email: cust?.email || undefined,
          name,
          phone,
          country: defaultCountry,
          region: region || undefined,
          province: region || undefined,
          city,
          address, // Clean address without duplicating city or region
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
