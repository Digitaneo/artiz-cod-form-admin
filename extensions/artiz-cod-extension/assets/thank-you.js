(function () {
  "use strict";

  const WORKER_URL = "https://artiz-cod-form.digitaneo.workers.dev";

  document.addEventListener("DOMContentLoaded", async function () {
    const wrapper = document.getElementById("artiz-thankyou-wrapper");
    if (!wrapper) return;

    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get("order_id");
    const shopDomain = urlParams.get("shop") || wrapper.dataset.shop || window.location.hostname;

    if (!orderId) {
      document.getElementById("artiz-order-number-display").textContent = "لم يتم العثور على رقم الطلب.";
      return;
    }

    try {
      const response = await fetch(`${WORKER_URL}/public/order-details?shop=${shopDomain}&order_id=${orderId}`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "فشل في جلب تفاصيل الطلب");
      }

      const order = data.order;

      document.getElementById("artiz-order-number-display").textContent = `رقم الطلب: ${order.orderNumber}`;

      const detailsContainer = document.getElementById("artiz-thankyou-details");
      if (!detailsContainer) return;

      let itemsHtml = order.items.map(item => `
        <div class="artiz-thankyou-item">
          <span>${item.title} (x${item.quantity})</span>
          <strong>${item.price}</strong>
        </div>
      `).join("");

      detailsContainer.innerHTML = `
        <div class="artiz-thankyou-summary-box">
          <h3>ملخص الطلب</h3>
          <div class="artiz-thankyou-items-list">${itemsHtml}</div>
          <div class="artiz-thankyou-total">
            <span>الإجمالي (الدفع عند الاستلام):</span>
            <strong>${order.total}</strong>
          </div>
        </div>

        <div class="artiz-thankyou-address-box">
          <h3>عنوان التوصيل</h3>
          <p><strong>الاسم:</strong> ${order.shippingAddress?.name || "-"}</p>
          <p><strong>الهاتف:</strong> ${order.shippingAddress?.phone || "-"}</p>
          <p><strong>المدينة والعنوان:</strong> ${order.shippingAddress?.city || ""} - ${order.shippingAddress?.address1 || ""}</p>
        </div>
      `;

    } catch (err) {
      console.error("Artiz COD Thank You Fetch Error:", err);
      document.getElementById("artiz-order-number-display").textContent = `خطأ: ${err.message}`;
    }
  });
})();
