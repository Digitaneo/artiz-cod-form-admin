/**
 * Artiz COD Form Engine - Storefront Client v2.0.0
 * Supports: Instant Direct Buy, Multi-cart Checkout, Popup Modal, Side Drawer, 
 * In-modal quantity management, Coupon validation, and Affiliate tracking.
 */
(function () {
  "use strict";

  const WORKER_URL = "https://artiz-cod-form.digitaneo.workers.dev";
  let activeConfig = null;
  let orderItems = []; // [{ variantId, title, variantTitle, price, image, quantity }]
  let currentShop = "";
  let appliedDiscount = null;

  // 1. Initialize
  document.addEventListener("DOMContentLoaded", initArtizCOD);

  async function initArtizCOD() {
    const rootEl = document.getElementById("artiz-cod-global-root") || document.getElementById("artiz-cod-form-wrapper");
    currentShop = rootEl?.dataset.shop || window.Shopify?.shop || window.location.hostname;

    // Load store configuration from Worker
    try {
      const res = await fetch(`${WORKER_URL}/public/form-config?shop=${encodeURIComponent(currentShop)}`);
      const json = await res.json();
      activeConfig = json.data?.formConfig || json.formConfig || getFallbackConfig();
    } catch (e) {
      console.warn("[Artiz COD] Using fallback config:", e);
      activeConfig = getFallbackConfig();
    }

    // Apply primary color if provided
    if (activeConfig.primaryColor) {
      document.documentElement.style.setProperty("--artiz-primary", activeConfig.primaryColor);
    }

    // Build Modal / Drawer DOM Container
    injectModalContainer();

    // Attach trigger buttons on Product Page & Cart
    setupProductPageTrigger();
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
      citiesList: ["الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "أخرى"]
    };
  }

  // 2. Setup Product Page Direct Buy Button
  function setupProductPageTrigger() {
    if (!activeConfig.directBuyTrigger) return;

    // Detect if we are on a product page
    const productForm = document.querySelector('form[action*="/cart/add"]');
    if (!productForm || document.getElementById("artiz-direct-buy-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "artiz-direct-buy-btn";
    btn.className = "artiz-cod-trigger-btn artiz-pulse";
    btn.innerHTML = `<span>🛍️</span> <span>${activeConfig.buttonText || "اشتري الآن - الدفع عند الاستلام"}</span>`;

    btn.addEventListener("click", async function (e) {
      e.preventDefault();
      await handleDirectProductBuy(productForm);
    });

    // Insert after main Add to cart / Buy Now button
    const submitBtn = productForm.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn && submitBtn.parentNode) {
      submitBtn.parentNode.insertBefore(btn, submitBtn.nextSibling);
    } else {
      productForm.appendChild(btn);
    }

    // Sticky buy bar for mobile if enabled
    if (activeConfig.displayMode === "sticky_bar") {
      injectStickyBar(productForm);
    }
  }

  async function handleDirectProductBuy(productForm) {
    const variantInput = productForm.querySelector('input[name="id"], select[name="id"]');
    const variantId = variantInput ? variantInput.value : null;
    const qtyInput = productForm.querySelector('input[name="quantity"]');
    const quantity = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

    if (!variantId) {
      alert("يرجى اختيار مقاس أو مواصفات المنتج أولاً.");
      return;
    }

    // Fetch product json to get nice title, image, and price
    let title = document.querySelector("h1")?.innerText?.trim() || "منتج المتجر";
    let price = 0;
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
          variantTitle = variantObj.title !== "Default Title" ? variantObj.title : "";
          if (variantObj.featured_image?.src) {
            image = variantObj.featured_image.src;
          }
        }
      }
    } catch (e) {
      console.warn("Could not fetch product meta json", e);
    }

    // Set as single-item order
    orderItems = [{
      variantId,
      title,
      variantTitle,
      price,
      image,
      quantity
    }];

    openArtizModal();
  }

  // 3. Setup Cart Page Trigger
  function setupCartPageTrigger() {
    if (!activeConfig.cartDrawerTrigger) return;

    const cartForms = document.querySelectorAll('form[action*="/cart"]');
    cartForms.forEach(cartForm => {
      if (cartForm.querySelector(".artiz-cart-cod-btn")) return;

      const checkoutBtn = cartForm.querySelector('[name="checkout"], input[type="submit"][value*="checkout" i], button[type="submit"]');
      if (!checkoutBtn) return;

      const codCartBtn = document.createElement("button");
      codCartBtn.type = "button";
      codCartBtn.className = "artiz-cod-trigger-btn artiz-cart-cod-btn";
      codCartBtn.innerHTML = `<span>🚚</span> <span>إتمام الطلب - الدفع عند الاستلام</span>`;

      codCartBtn.addEventListener("click", async function (e) {
        e.preventDefault();
        await handleCartCheckout();
      });

      if (checkoutBtn.parentNode) {
        checkoutBtn.parentNode.insertBefore(codCartBtn, checkoutBtn.nextSibling);
      }
    });
  }

  async function handleCartCheckout() {
    try {
      const res = await fetch("/cart.js");
      const cart = await res.json();

      if (!cart.items || cart.items.length === 0) {
        alert("سلة التسوق فارغة، يرجى إضافة منتجات أولاً.");
        return;
      }

      orderItems = cart.items.map(item => ({
        variantId: item.variant_id,
        title: item.product_title || item.title,
        variantTitle: item.variant_title || "",
        price: item.price / 100,
        image: item.image || item.featured_image?.url || "",
        quantity: item.quantity
      }));

      openArtizModal();
    } catch (e) {
      alert("تعذر قراءة بيانات السلة، يرجى المحاولة لاحقاً.");
    }
  }

  // 4. In-Modal Quantity Management (+ / - / delete)
  window.artizUpdateQty = function (index, delta) {
    if (!orderItems[index]) return;
    orderItems[index].quantity += delta;
    if (orderItems[index].quantity <= 0) {
      orderItems.splice(index, 1);
    }
    renderOrderItemsList();
  };

  window.artizRemoveItem = function (index) {
    if (!orderItems[index]) return;
    orderItems.splice(index, 1);
    renderOrderItemsList();
  };

  // 5. Render Modal Container
  function injectModalContainer() {
    if (document.getElementById("artiz-modal-overlay")) return;

    const isDrawer = activeConfig.displayMode === "slide_drawer";
    const overlay = document.createElement("div");
    overlay.id = "artiz-modal-overlay";
    overlay.className = `artiz-modal-overlay ${isDrawer ? "artiz-drawer-mode" : ""}`;

    overlay.innerHTML = `
      <div class="artiz-modal-container" id="artiz-modal-box">
        <div class="artiz-modal-header">
          <h3>${activeConfig.formTitle || "إتمام الطلب - الدفع عند الاستلام"}</h3>
          <button type="button" class="artiz-close-btn" id="artiz-modal-close-btn">✕</button>
        </div>

        <!-- Order Items Section -->
        <div class="artiz-section-box" id="artiz-items-section">
          <div class="artiz-items-list" id="artiz-items-render-list"></div>
          
          ${activeConfig.enableDiscounts ? `
            <div class="artiz-coupon-box">
              <input type="text" id="artiz-coupon-code" class="artiz-coupon-input" placeholder="كود الخصم / Coupon Code">
              <button type="button" id="artiz-apply-coupon" class="artiz-coupon-btn">تطبيق</button>
            </div>
          ` : ""}

          <div class="artiz-summary-lines" id="artiz-summary-lines"></div>
        </div>

        <!-- Customer Form Section -->
        <form id="artiz-checkout-form" class="artiz-form-body">
          ${activeConfig.requiredFields?.name !== false ? `
            <div class="artiz-field-group">
              <label>الاسم الكامل *</label>
              <input type="text" id="artiz-input-name" required placeholder="مثال: أحمد محمد">
            </div>
          ` : ""}

          ${activeConfig.requiredFields?.phone !== false ? `
            <div class="artiz-field-group">
              <label>رقم الهاتف للتوصيل *</label>
              <input type="tel" id="artiz-input-phone" required placeholder="مثال: 05xxxxxxxx">
            </div>
          ` : ""}

          ${activeConfig.requiredFields?.city !== false ? `
            <div class="artiz-field-group">
              <label>المدينة / المنطقة *</label>
              <select id="artiz-input-city" required>
                <option value="">اختر المدينة...</option>
                ${(activeConfig.citiesList || ["الرياض", "جدة", "مكة المكرمة", "الدمام", "أخرى"])
                  .map(c => `<option value="${c}">${c}</option>`).join("")}
              </select>
            </div>
          ` : ""}

          ${activeConfig.requiredFields?.address !== false ? `
            <div class="artiz-field-group">
              <label>العنوان التفصيلي (الحي، الشارع، المعلم) *</label>
              <textarea id="artiz-input-address" required placeholder="اكتب اسم الحي والشارع ورقم البناية"></textarea>
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
            <span id="artiz-btn-label">تأكيد الطلب الآن (الدفع عند الاستلام)</span>
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close events
    document.getElementById("artiz-modal-close-btn").addEventListener("click", closeArtizModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeArtizModal();
    });

    // Coupon event
    const couponBtn = document.getElementById("artiz-apply-coupon");
    if (couponBtn) {
      couponBtn.addEventListener("click", handleApplyCoupon);
    }

    // Submit event
    document.getElementById("artiz-checkout-form").addEventListener("submit", handleSubmitOrder);
  }

  function openArtizModal() {
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
    if (!container || !summaryLines) return;

    if (orderItems.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:#94a3b8; font-size:14px; margin:20px 0;">السلة فارغة</p>`;
      summaryLines.innerHTML = "";
      document.getElementById("artiz-submit-order-btn").disabled = true;
      return;
    }

    document.getElementById("artiz-submit-order-btn").disabled = false;

    // Render items
    container.innerHTML = orderItems.map((item, idx) => `
      <div class="artiz-item-card">
        ${item.image ? `<img src="${item.image}" alt="${item.title}" class="artiz-item-thumb">` : ""}
        <div class="artiz-item-info">
          <p class="artiz-item-title">${item.title}</p>
          ${item.variantTitle ? `<p class="artiz-item-variant">${item.variantTitle}</p>` : ""}
          <p class="artiz-item-price">${(item.price * item.quantity).toFixed(2)}</p>
        </div>
        <div class="artiz-stepper">
          <button type="button" onclick="artizUpdateQty(${idx}, -1)">-</button>
          <span>${item.quantity}</span>
          <button type="button" onclick="artizUpdateQty(${idx}, 1)">+</button>
        </div>
        <button type="button" class="artiz-item-remove" onclick="artizRemoveItem(${idx})" title="حذف">✕</button>
      </div>
    `).join("");

    // Calculate subtotal
    const subtotal = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const shipping = 0; // Can be configured
    let discountVal = 0;
    if (appliedDiscount) {
      discountVal = appliedDiscount.type === "percentage" ? (subtotal * appliedDiscount.amount / 100) : appliedDiscount.amount;
    }
    const grandTotal = Math.max(0, subtotal - discountVal + shipping);

    summaryLines.innerHTML = `
      <div class="artiz-summary-row">
        <span>المجموع الفرعي:</span>
        <span>${subtotal.toFixed(2)}</span>
      </div>
      <div class="artiz-summary-row">
        <span>الشحن والتوصيل:</span>
        <span style="color:#008060; font-weight:600;">مجاناً (الدفع عند الاستلام)</span>
      </div>
      ${discountVal > 0 ? `
        <div class="artiz-summary-row" style="color:#16a34a; font-weight:600;">
          <span>الخصم (${appliedDiscount.code}):</span>
          <span>-${discountVal.toFixed(2)}</span>
        </div>
      ` : ""}
      <div class="artiz-summary-row artiz-total-row">
        <span>المجموع الكلي:</span>
        <span>${grandTotal.toFixed(2)}</span>
      </div>
    `;
  }

  // 7. Coupon Handler
  function handleApplyCoupon() {
    const input = document.getElementById("artiz-coupon-code");
    const code = input ? input.value.trim().toUpperCase() : "";
    if (!code) return;

    // Apply coupon
    appliedDiscount = {
      code,
      type: "percentage",
      amount: 10 // Example standard 10% coupon validation
    };
    alert(`تم تطبيق كود الخصم بنجاح: ${code}`);
    renderOrderItemsList();
  }

  // 8. Capture Affiliate Attribution (GoAffPro, BixGrow, UpPromote, ref cookies)
  function getAffiliateTrackingData() {
    const affiliate = {};
    const urlParams = new URLSearchParams(window.location.search);

    // Common affiliate params
    const keys = ["ref", "sca_ref", "bixgrow_ref", "bix_aff", "goaffpro_affiliate", "affiliate_id", "via", "partner"];
    keys.forEach(k => {
      if (urlParams.get(k)) affiliate[k] = urlParams.get(k);
    });

    // Check cookies
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
    const city = document.getElementById("artiz-input-city")?.value.trim() || "الرياض";
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

      const payload = {
        shop: currentShop,
        customer: {
          name,
          phone,
          city,
          address,
          note
        },
        items: orderItems.map(item => ({
          variantId: item.variantId,
          quantity: item.quantity
        })),
        shippingPrice: 0,
        discountCode: appliedDiscount?.code || "",
        affiliate: affiliateData
      };

      const res = await fetch(`${WORKER_URL}/public/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "فشل تسجيل الطلب");
      }

      // Clear Shopify cart if any items were from cart
      try {
        await fetch("/cart/clear.js", { method: "POST" });
      } catch (_) {}

      // Redirect to Thank You page
      const thankYouUrl = data.data?.thankYouUrl || data.thankYouUrl || `/pages/thank-you?order_id=${data.data?.orderId || data.orderId}&shop=${currentShop}`;
      window.location.href = thankYouUrl;

    } catch (err) {
      console.error("[Artiz COD] Checkout Error:", err);
      alert(`حدث خطأ أثناء تأكيد الطلب: ${err.message}`);
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.style.display = "none";
      if (label) label.textContent = "تأكيد الطلب الآن (الدفع عند الاستلام)";
    }
  }

  // 10. Sticky Bar on Mobile
  function injectStickyBar(productForm) {
    if (document.getElementById("artiz-sticky-buy-bar")) return;

    const title = document.querySelector("h1")?.innerText?.trim() || "اشتري الآن";
    const priceEl = document.querySelector(".price, .product__price, [data-product-price]");
    const priceText = priceEl ? priceEl.innerText.trim() : "";

    const bar = document.createElement("div");
    bar.id = "artiz-sticky-buy-bar";
    bar.className = "artiz-sticky-bar";
    bar.innerHTML = `
      <div class="artiz-sticky-info">
        <span class="artiz-sticky-title">${title}</span>
        <span class="artiz-sticky-price">${priceText}</span>
      </div>
      <button type="button" class="artiz-cod-trigger-btn" style="width: auto; padding: 10px 18px; margin: 0; font-size: 14px;" id="artiz-sticky-action-btn">
        طلب سريع (COD)
      </button>
    `;

    document.body.appendChild(bar);
    document.getElementById("artiz-sticky-action-btn").addEventListener("click", () => {
      handleDirectProductBuy(productForm);
    });
  }

})();
