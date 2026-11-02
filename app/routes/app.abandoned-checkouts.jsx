import { useState } from "react";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "react-router";
import { fetchWorker } from "../services/api.server";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  TextField,
  Badge,
  Banner,
  Divider,
  Box
} from "@shopify/polaris";

export async function loader({ request }) {
  try {
    const res = await fetchWorker(request, "/abandoned/list");
    const data = res.data || res || {};
    return {
      ok: true,
      stats: data.stats || {
        totalAbandoned: 0,
        potentialLostValue: 0,
        abandonedToday: 0,
        contactedCount: 0,
        currency: "IQD"
      },
      checkouts: data.checkouts || []
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      stats: { totalAbandoned: 0, potentialLostValue: 0, abandonedToday: 0, contactedCount: 0, currency: "IQD" },
      checkouts: []
    };
  }
}

export async function action({ request }) {
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  try {
    if (actionType === "convert") {
      const sessionId = formData.get("sessionId");
      const res = await fetchWorker(request, "/abandoned/convert", {
        method: "POST",
        body: JSON.stringify({ sessionId })
      });
      const orderNumber = res.data?.orderNumber || res.orderNumber || "";
      return { ok: true, message: `تم استرجاع السلة وتحويلها إلى طلب شوبيفاي بنجاح! رقم الطلب: #${orderNumber}` };
    }

    if (actionType === "updateStatus") {
      const sessionId = formData.get("sessionId");
      const contactStatus = formData.get("contactStatus");
      await fetchWorker(request, "/abandoned/status", {
        method: "POST",
        body: JSON.stringify({ sessionId, contactStatus })
      });
      return { ok: true, message: "تم تحديث حالة المراسلة." };
    }

    if (actionType === "delete") {
      const sessionId = formData.get("sessionId");
      await fetchWorker(request, "/abandoned/delete", {
        method: "POST",
        body: JSON.stringify({ sessionId })
      });
      return { ok: true, message: "تم حذف السلة المتروكة بنجاح." };
    }

    if (actionType === "cleanupOld") {
      const olderThanHours = formData.get("olderThanHours") || 24;
      const res = await fetchWorker(request, "/abandoned/delete", {
        method: "POST",
        body: JSON.stringify({ olderThanHours })
      });
      const count = res.data?.deletedCount !== undefined ? res.data.deletedCount : (res.deletedCount || 0);
      return { ok: true, message: `تم تنظيف ${count} سلة متروكة قديمة بنجاح!` };
    }

    return { ok: false, error: "نوع الإجراء غير معروف" };
  } catch (err) {
    return { ok: false, error: err.message || "فشلت العملية" };
  }
}

function formatRelativeTime(dateString) {
  if (!dateString) return "غير محدد";
  const ms = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(ms / (1000 * 60));
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

export default function AbandonedCheckouts() {
  const { stats, checkouts, error: loaderError } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [searchQuery, setSearchQuery] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("all");

  const filteredCheckouts = checkouts.filter(item => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = (item.customer?.name || "").toLowerCase();
      const phone = (item.customer?.phone || "").toLowerCase();
      const city = (item.customer?.city || "").toLowerCase();
      const id = (item.sessionId || "").toLowerCase();
      const products = (item.items || []).map(i => i.title).join(" ").toLowerCase();
      if (!name.includes(q) && !phone.includes(q) && !city.includes(q) && !id.includes(q) && !products.includes(q)) {
        return false;
      }
    }

    // 2. Filter Period
    if (filterPeriod === "today") {
      const today = new Date().toISOString().split("T")[0];
      return item.createdAt && item.createdAt.startsWith(today);
    }
    if (filterPeriod === "week") {
      const weekAgoMs = Date.now() - (7 * 24 * 60 * 60 * 1000);
      return item.createdAt && new Date(item.createdAt).getTime() >= weekAgoMs;
    }

    return true;
  });

  const handleOpenWhatsApp = (checkout) => {
    const rawPhone = checkout.customer?.phone || "";
    const cleanPhone = rawPhone.replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (!cleanPhone) {
      alert("لا يوجد رقم هاتف صالح للعميل.");
      return;
    }

    const customerName = checkout.customer?.name || "عزيزنا العميل";
    const productNames = (checkout.items || []).map(i => i.title).join(" + ") || "طلبك";
    const totalAmount = `${checkout.pricing?.total || 0} ${stats.currency || "IQD"}`;

    const text = `مرحباً ${customerName}، لاحظنا أنك بدأت طلب (${productNames}) بقيمة ${totalAmount} في متجرنا ولم تكتمل عملية الدفع الإلكتروني. هل ترغب في تأكيد شحن الطلب لك بنظام الدفع عند الاستلام (COD) مع توصيل سريع لعنوانك؟`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;

    // Open WhatsApp in new tab
    window.open(waUrl, "_blank");

    // Automatically update status to contacted
    if (checkout.contactStatus !== "contacted" && checkout.status !== "converted") {
      const fd = new FormData();
      fd.append("actionType", "updateStatus");
      fd.append("sessionId", checkout.sessionId);
      fd.append("contactStatus", "contacted");
      submit(fd, { method: "post" });
    }
  };

  const handleConvert = (sessionId) => {
    if (!confirm("هل تريد تحويل هذه السلة المتروكة إلى طلب فعلي بنظام الدفع عند الاستلام (COD) في شوبيفاي؟")) {
      return;
    }
    const fd = new FormData();
    fd.append("actionType", "convert");
    fd.append("sessionId", sessionId);
    submit(fd, { method: "post" });
  };

  const handleDelete = (sessionId) => {
    if (!confirm("هل أنت متأكد من حذف هذه السلة المتروكة نهائياً؟")) {
      return;
    }
    const fd = new FormData();
    fd.append("actionType", "delete");
    fd.append("sessionId", sessionId);
    submit(fd, { method: "post" });
  };

  const handleCleanup24h = () => {
    if (!confirm("هل تريد تنظيف وحذف جميع السلات المتروكة الأقدم من 24 ساعة؟")) {
      return;
    }
    const fd = new FormData();
    fd.append("actionType", "cleanupOld");
    fd.append("olderThanHours", "24");
    submit(fd, { method: "post" });
  };

  return (
    <Page fullWidth title="إدارة واستعادة السلات المتروكة" subtitle="راسل العملاء الذين ترددوا أو واجهوا مشكلة أثناء الدفع، أو حول سلتهم لطلب دفع عند الاستلام بنقرة واحدة.">
      <BlockStack gap="500">
        {actionData?.message && (
          <Banner tone="success" onDismiss={() => {}}>
            {actionData.message}
          </Banner>
        )}
        {(actionData?.error || loaderError) && (
          <Banner tone="critical" onDismiss={() => {}}>
            {actionData?.error || loaderError}
          </Banner>
        )}

        {/* 1. Header Metrics Cards - matching the screenshot layout */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          direction: "rtl"
        }}>
          {/* Card 1: إجمالي السلات المتروكة */}
          <div style={{
            background: "#1e1e1e",
            color: "#fff",
            padding: "20px",
            borderRadius: "14px",
            border: "1px solid #333",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div>
              <div style={{ fontSize: "13px", color: "#aaa", marginBottom: "6px" }}>إجمالي السلات المتروكة</div>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "#f59e0b" }}>{stats.totalAbandoned}</div>
              <div style={{ fontSize: "11px", color: "#777", marginTop: "4px" }}>محاولات دفع لم تكتمل</div>
            </div>
            <div style={{ fontSize: "32px", background: "rgba(245, 158, 11, 0.15)", width: "54px", height: "54px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              🛒
            </div>
          </div>

          {/* Card 2: القيمة المحتملة الضائعة */}
          <div style={{
            background: "#1e1e1e",
            color: "#fff",
            padding: "20px",
            borderRadius: "14px",
            border: "1px solid #333",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div>
              <div style={{ fontSize: "13px", color: "#aaa", marginBottom: "6px" }}>القيمة المحتملة الضائعة</div>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "#ec4899" }}>
                {Number(stats.potentialLostValue || 0).toLocaleString()} <span style={{ fontSize: "14px" }}>{stats.currency}</span>
              </div>
              <div style={{ fontSize: "11px", color: "#777", marginTop: "4px" }}>مبالغ قابلة للاسترداد</div>
            </div>
            <div style={{ fontSize: "32px", background: "rgba(236, 72, 153, 0.15)", width: "54px", height: "54px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              💰
            </div>
          </div>

          {/* Card 3: سلات اليوم */}
          <div style={{
            background: "#1e1e1e",
            color: "#fff",
            padding: "20px",
            borderRadius: "14px",
            border: "1px solid #333",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div>
              <div style={{ fontSize: "13px", color: "#aaa", marginBottom: "6px" }}>سلات اليوم</div>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "#3b82f6" }}>{stats.abandonedToday}</div>
              <div style={{ fontSize: "11px", color: "#777", marginTop: "4px" }}>متروكة خلال آخر 24 ساعة</div>
            </div>
            <div style={{ fontSize: "32px", background: "rgba(59, 130, 246, 0.15)", width: "54px", height: "54px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              📅
            </div>
          </div>

          {/* Card 4: تم التواصل معهم */}
          <div style={{
            background: "#1e1e1e",
            color: "#fff",
            padding: "20px",
            borderRadius: "14px",
            border: "1px solid #333",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div>
              <div style={{ fontSize: "13px", color: "#aaa", marginBottom: "6px" }}>تم التواصل معهم</div>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "#10b981" }}>{stats.contactedCount}</div>
              <div style={{ fontSize: "11px", color: "#777", marginTop: "4px" }}>عبر رسائل واتساب</div>
            </div>
            <div style={{ fontSize: "32px", background: "rgba(16, 185, 129, 0.15)", width: "54px", height: "54px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              💬
            </div>
          </div>
        </div>

        {/* 2. Control & Search Toolbar */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flex: 1, minWidth: "280px" }}>
                <div style={{ flex: 1 }}>
                  <TextField
                    placeholder="ابحث برقم السلة / الجوال / الاسم / المنتج..."
                    value={searchQuery}
                    onChange={(val) => setSearchQuery(val)}
                    clearButton
                    onClearButtonClick={() => setSearchQuery("")}
                    autoComplete="off"
                  />
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <Button pressed={filterPeriod === "all"} onClick={() => setFilterPeriod("all")} size="slim">
                    كل الوقت
                  </Button>
                  <Button pressed={filterPeriod === "today"} onClick={() => setFilterPeriod("today")} size="slim">
                    اليوم
                  </Button>
                  <Button pressed={filterPeriod === "week"} onClick={() => setFilterPeriod("week")} size="slim">
                    آخر 7 أيام
                  </Button>
                </div>
              </div>

              <InlineStack gap="200">
                <Button tone="critical" onClick={handleCleanup24h} loading={isSubmitting}>
                  🧹 تنظيف الأقدم من 24 ساعة
                </Button>
              </InlineStack>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* 3. Abandoned Orders Table */}
        <Card padding="0">
          {filteredCheckouts.length === 0 ? (
            <Box padding="800">
              <BlockStack align="center" inlineAlign="center" gap="300">
                <div style={{ fontSize: "48px" }}>🎉</div>
                <Text variant="headingMd" as="h3">لا توجد سلات متروكة تطابق الفلتر الحالي</Text>
                <Text tone="subdued">جميع عمليات الدفع مكتملة أو تم تنظيف السلات السابقة بنجاح.</Text>
              </BlockStack>
            </Box>
          ) : (
            <div style={{ overflowX: "auto", direction: "rtl" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", textAlign: "right" }}>
                    <th style={{ padding: "14px 16px", color: "#4b5563" }}>رقم السلة</th>
                    <th style={{ padding: "14px 16px", color: "#4b5563" }}>العميل</th>
                    <th style={{ padding: "14px 16px", color: "#4b5563" }}>المنتج</th>
                    <th style={{ padding: "14px 16px", color: "#4b5563" }}>المبلغ</th>
                    <th style={{ padding: "14px 16px", color: "#4b5563" }}>وقت الترك</th>
                    <th style={{ padding: "14px 16px", color: "#4b5563" }}>حالة المراسلة</th>
                    <th style={{ padding: "14px 16px", color: "#4b5563", textAlign: "center" }}>إجراءات الاستعادة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCheckouts.map((checkout) => {
                    const isConverted = checkout.status === "converted";
                    const isFailed = checkout.status === "payment_failed";
                    const isContacted = checkout.contactStatus === "contacted" || isConverted;

                    return (
                      <tr
                        key={checkout.sessionId}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          background: isConverted ? "#f0fdf4" : "transparent",
                          transition: "background 0.2s"
                        }}
                      >
                        {/* 1. Session ID */}
                        <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: "12px", color: "#6b7280" }}>
                          {checkout.sessionId.slice(-10)}
                        </td>

                        {/* 2. Customer Info */}
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ fontWeight: "600", color: "#111827" }}>
                            {checkout.customer?.name || "عميل غير مسمى"}
                          </div>
                          <div style={{ color: "#4b5563", fontSize: "12px", direction: "ltr", textAlign: "right" }}>
                            {checkout.customer?.phone || "-"}
                          </div>
                          {checkout.customer?.city && (
                            <div style={{ color: "#9ca3af", fontSize: "11px" }}>
                              📍 {checkout.customer.city}
                            </div>
                          )}
                        </td>

                        {/* 3. Items */}
                        <td style={{ padding: "14px 16px", maxWidth: "260px" }}>
                          {(checkout.items || []).map((it, idx) => (
                            <div key={idx} style={{ marginBottom: "4px" }}>
                              <span style={{ fontWeight: "500", color: "#1f2937" }}>{it.title}</span>
                              {it.variantTitle && <span style={{ color: "#6b7280", fontSize: "11px" }}> ({it.variantTitle})</span>}
                              <span style={{ color: "#d97706", fontWeight: "600", marginRight: "6px" }}> × {it.quantity || 1}</span>
                            </div>
                          ))}
                        </td>

                        {/* 4. Total Amount */}
                        <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: "bold", fontSize: "14px", color: "#111827" }}>
                            {Number(checkout.pricing?.total || 0).toLocaleString()} <span style={{ fontSize: "11px" }}>{stats.currency}</span>
                          </div>
                        </td>

                        {/* 5. Abandoned Time */}
                        <td style={{ padding: "14px 16px", whiteSpace: "nowrap", color: "#6b7280" }}>
                          🕒 {formatRelativeTime(checkout.createdAt)}
                        </td>

                        {/* 6. Contact / Flow Status Badge */}
                        <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                          {isConverted ? (
                            <Badge tone="success">
                              {`مسترجع (#${checkout.convertedOrderNumber || ""})`}
                            </Badge>
                          ) : isFailed ? (
                            <Badge tone="critical">فشل الدفع لدى البنك</Badge>
                          ) : isContacted ? (
                            <Badge tone="info">تم الإرسال (واتساب)</Badge>
                          ) : (
                            <Badge tone="warning">لم يُراسل بعد</Badge>
                          )}
                        </td>

                        {/* 7. Action Buttons */}
                        <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                          <InlineStack gap="200" align="center">
                            {/* WhatsApp Direct Action Button */}
                            <button
                              onClick={() => handleOpenWhatsApp(checkout)}
                              style={{
                                background: "#25D366",
                                color: "#fff",
                                border: "none",
                                borderRadius: "8px",
                                padding: "6px 12px",
                                fontSize: "12px",
                                fontWeight: "600",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                cursor: "pointer",
                                boxShadow: "0 2px 4px rgba(37, 211, 102, 0.2)"
                              }}
                              title="فتح واتساب بمحادثة مجهزة"
                            >
                              <span>💬</span> مراسلة
                            </button>

                            {/* Convert to Real COD Order Button */}
                            {!isConverted && (
                              <Button
                                size="slim"
                                tone="success"
                                onClick={() => handleConvert(checkout.sessionId)}
                                loading={isSubmitting}
                              >
                                تحويل لطلب COD
                              </Button>
                            )}

                            {/* Delete single checkout */}
                            <Button
                              size="slim"
                              tone="critical"
                              variant="plain"
                              onClick={() => handleDelete(checkout.sessionId)}
                              loading={isSubmitting}
                            >
                              🗑
                            </Button>
                          </InlineStack>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
