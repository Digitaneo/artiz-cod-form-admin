(function () {
  "use strict";

  const WORKER_URL = "https://artiz-cod-form.digitaneo.workers.dev";

  document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("artiz-cod-form");
    if (!form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const wrapper = document.getElementById("artiz-cod-form-wrapper");
      const shopDomain = wrapper ? wrapper.dataset.shop : window.location.hostname;

      const name = document.getElementById("artiz-customer-name").value.trim();
      const phone = document.getElementById("artiz-customer-phone").value.trim();
      const city = document.getElementById("artiz-customer-city").value.trim();
      const address = document.getElementById("artiz-customer-address").value.trim();
      const note = document.getElementById("artiz-customer-note")?.value.trim() || "";

      if (!name || !phone || !city || !address) {
        alert("يرجى ملء جميع الحقول المطلوبة.");
        return;
      }

      const submitBtn = document.getElementById("artiz-submit-btn");
      const btnText = document.getElementById("artiz-btn-text");
      const btnLoader = document.getElementById("artiz-btn-loader");

      if (submitBtn) submitBtn.disabled = true;
      if (btnText) btnText.style.display = "none";
      if (btnLoader) btnLoader.style.display = "inline-block";

      try {
        // 1. Fetch active cart items from Shopify
        const cartRes = await fetch("/cart.js");
        const cartData = await cartRes.json();

        if (!cartData.items || cartData.items.length === 0) {
          alert("السلة فارغة، يرجى إضافة منتجات أولاً.");
          if (submitBtn) submitBtn.disabled = false;
          if (btnText) btnText.style.display = "inline-block";
          if (btnLoader) btnLoader.style.display = "none";
          return;
        }

        const items = cartData.items.map(item => ({
          variantId: item.variant_id,
          quantity: item.quantity
        }));

        // 2. Submit order payload to Cloudflare Worker
        const payload = {
          shop: shopDomain,
          customer: { name, phone, city, address, note },
          items,
          shippingPrice: 0
        };

        const response = await fetch(`${WORKER_URL}/public/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "فشل في تسجيل الطلب");
        }

        // 3. Clear cart in Shopify
        await fetch("/cart/clear.js", { method: "POST" });

        // 4. Redirect to Thank You Page
        window.location.href = data.thankYouUrl || `/pages/thank-you?order_id=${data.orderId}&shop=${shopDomain}`;

      } catch (err) {
        console.error("Artiz COD Checkout Error:", err);
        alert(`حدث خطأ أثناء إرسال الطلب: ${err.message}`);
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.style.display = "inline-block";
        if (btnLoader) btnLoader.style.display = "none";
      }
    });
  });
})();
