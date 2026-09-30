import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getDashboardStats } from "../models/dashboard.server";
import { workerFetch } from "../services/api.server";

import AppLayout from "../components/AppLayout";
import DashboardCards from "../components/Dashboard/DashboardCards";
import RecentOrders from "../components/Dashboard/RecentOrders";
import SystemStatus from "../components/Dashboard/SystemStatus";

import { BlockStack, Layout, Page } from "@shopify/polaris";

export async function loader({ request }) {
  let stats = { orders: 0, revenue: 0, customers: 0, products: 0 };
  let recentOrders = [];
  let shopifyOk = false;
  let shop = null;
  let session = null;
  let admin = null;

  try {
    const authResult = await authenticate.admin(request);
    session = authResult.session;
    admin = authResult.admin;
    shop = session?.shop;
  } catch (error) {
    console.error("Dashboard authenticate.admin failed:", error);
  }

  // 1. Fetch dashboard stats via Worker Single Source of Truth
  if (session) {
    try {
      const summaryRes = await workerFetch(session, "/dashboard/summary");
      if (summaryRes?.ok && summaryRes?.summary) {
        stats = {
          orders: summaryRes.summary.stats?.orders || 0,
          revenue: summaryRes.summary.stats?.revenue || 0,
          customers: summaryRes.summary.stats?.customers || 0,
          products: summaryRes.summary.stats?.products || 0,
        };
        recentOrders = (summaryRes.summary.recentOrders || []).map(o => ({
          orderNumber: o.orderNumber || "-",
          customer: o.customer || "Guest Customer",
          total: o.total || "0",
          status: o.financialStatus || o.status || "-"
        }));
        shopifyOk = true;
      }
    } catch (e) {
      console.warn("Worker dashboard summary failed, attempting direct fallback:", e);
    }
  }

  // 2. Fallback to direct Shopify Admin query if worker summary was unavailable
  if (!shopifyOk && admin) {
    try {
      const statsData = await getDashboardStats(admin);
      stats = {
        orders: statsData.orders,
        revenue: statsData.revenue,
        customers: statsData.customers,
        products: statsData.products,
      };
      recentOrders = statsData.recentOrders;
      shopifyOk = true;
    } catch (error) {
      console.error("Dashboard direct Shopify query failed:", error);
    }
  }

  // 3. Query Worker for system status
  let systemStatus = {
    worker: false,
    kv: false,
    accessToken: false,
    shopify: shopifyOk,
  };

  if (session) {
    try {
      const workerStatus = await workerFetch(session, "/system/status");
      const statusData = workerStatus?.data || workerStatus;
      systemStatus = {
        worker: statusData?.worker?.status === "HEALTHY",
        kv: statusData?.database?.kvStatus === "HEALTHY",
        accessToken: statusData?.security?.accessTokenStatus === "ACTIVE",
        shopify: shopifyOk || statusData?.shopify?.connection === "CONNECTED",
      };
    } catch (error) {
      console.error("Dashboard workerFetch system/status failed:", error);
    }
  }

  return {
    ok: true,
    shop,
    summary: {
      stats,
      recentOrders,
      system: systemStatus,
    },
  };
}

export default function Dashboard() {
  const { summary } = useLoaderData();

  const stats = summary.stats || {
    orders: 0,
    revenue: 0,
    customers: 0,
    products: 0,
  };

  const recentOrders = summary.recentOrders || [];

  const systemStatus = summary.system || {
    worker: true,
    kv: true,
    accessToken: true,
    shopify: true,
  };

  return (
    <AppLayout
      title="Dashboard"
      subtitle="Artiz COD Form Overview"
    >
      <Page title="Dashboard Summary">
        <BlockStack gap="500">
          <DashboardCards stats={stats} />

          <Layout>
            <Layout.Section variant="oneHalf">
              <RecentOrders orders={recentOrders} />
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <SystemStatus status={systemStatus} />
            </Layout.Section>
          </Layout>

        </BlockStack>
      </Page>
    </AppLayout>
  );
}