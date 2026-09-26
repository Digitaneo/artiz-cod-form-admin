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

  // 1. Fetch dashboard stats directly from Shopify Admin API
  try {
    const authResult = await authenticate.admin(request);
    session = authResult.session;
    shop = session?.shop;
    const statsData = await getDashboardStats(authResult.admin);
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

  // 2. Query Worker for system status (using workerFetch — no double authenticate.admin)
  let systemStatus = {
    worker: false,
    kv: false,
    accessToken: false,
    shopify: shopifyOk,
  };

  if (shopifyOk && session) {
    try {
      const workerStatus = await workerFetch(session, "/system/status");
      const statusData = workerStatus?.data || workerStatus;
      systemStatus = {
        worker: statusData?.worker?.status === "HEALTHY",
        kv: statusData?.database?.kvStatus === "HEALTHY",
        accessToken: statusData?.security?.accessTokenStatus === "ACTIVE",
        shopify: shopifyOk,
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