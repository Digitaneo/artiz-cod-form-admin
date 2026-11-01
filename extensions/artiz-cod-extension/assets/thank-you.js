(function () {
  "use strict";

  const WORKER_URL = "https://aladdin-quick-order.digitaneo.workers.dev";

  document.addEventListener("DOMContentLoaded", async function () {
    const wrapper = document.getElementById("artiz-thankyou-wrapper");
    if (!wrapper) return;

    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get("order_id");
    const sessionId = urlParams.get("session_id");
    const shopDomain = urlParams.get("shop") || wrapper.dataset.shop || window.location.hostname;

    if (!orderId && !sessionId) {
      document.getElementById("artiz-order-number-display").textContent = "لم يتم العثور على رقم الطلب.";
      return;
    }

    const orderDisplay = document.getElementById("artiz-order-number-display");
    const detailsContainer = document.getElementById("artiz-thankyou-details");

    async function fetchOrderDetails(retryCount = 0) {
      try {
        const queryParam = orderId ? `order_id=${encodeURIComponent(orderId)}` : `session_id=${encodeURIComponent(sessionId)}`;
        const response = await fetch(`${WORKER_URL}/public/order-details?shop=${encodeURIComponent(shopDomain)}&${queryParam}`);
        const data = await response.json();

        if (data.data?.pending && retryCount < 5) {
          if (orderDisplay) orderDisplay.textContent = "جاري تأكيد الدفع الإلكتروني وتوثيق طلبك...";
          setTimeout(() => fetchOrderDetails(retryCount + 1), 2500);
          return;
        }

        if (!response.ok || !data.ok || !data.data?.order) {
          throw new Error(data.error || "فشل في جلب تفاصيل الطلب");
        }

        const order = data.data.order;
        if (orderDisplay) orderDisplay.textContent = `رقم الطلب: ${order.orderNumber}`;

        if (!detailsContainer) return;

        let itemsHtml = order.items.map(item => `
          <div class="artiz-thankyou-item">
            <span>${item.title} (x${item.quantity})</span>
            <strong>${item.price}</strong>
          </div>
        `).join("");

        const isPaid = data.data?.paid || order.financialStatus === "paid";
        const paymentLabel = isPaid ? "الإجمالي (تم الدفع إلكترونياً بنجاح):" : "الإجمالي (الدفع عند الاستلام):";

        detailsContainer.innerHTML = `
          <div class="artiz-thankyou-summary-box">
            <h3>ملخص الطلب</h3>
            <div class="artiz-thankyou-items-list">${itemsHtml}</div>
            <div class="artiz-thankyou-total">
              <span>${paymentLabel}</span>
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
        if (orderDisplay) orderDisplay.textContent = `خطأ: ${err.message}`;
      }
    }

    fetchOrderDetails();
  });
})();
