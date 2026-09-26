export async function getDashboardStats(admin) {
  if (!admin) {
    throw new Error("Shopify Admin API client is missing.");
  }

  const response = await admin.graphql(`
    query DashboardStats {
      orders(first: 50, reverse: true) {
        edges {
          node {
            id
            name

            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }

            displayFinancialStatus
            displayFulfillmentStatus
            createdAt
          }
        }
      }

      products(first: 50) {
        edges {
          node {
            id
          }
        }
      }
    }
  `);

  const json = await response.json();

  if (json.errors) {
    throw new Error(
      `Shopify GraphQL Error: ${JSON.stringify(json.errors)}`
    );
  }

  if (!json.data) {
    throw new Error("Shopify returned no data.");
  }

  const orders = json.data.orders?.edges || [];
  const customers = json.data.customers?.edges || [];
  const products = json.data.products?.edges || [];

  let revenue = 0;

  for (const order of orders) {
    const amount = Number(
      order.node?.currentTotalPriceSet?.shopMoney?.amount || 0
    );

    revenue += amount;
  }

  const recentOrders = orders
    .slice(0, 5)
    .map(({ node }) => {
      const customerName = node.customer
        ? `${node.customer.firstName || ""} ${node.customer.lastName || ""
          }`.trim()
        : "Guest Customer";

      const amount =
        node.currentTotalPriceSet?.shopMoney?.amount || "0";

      const currency =
        node.currentTotalPriceSet?.shopMoney?.currencyCode || "";

      return {
        id: node.id || "",
        orderNumber: node.name || "-",
        customer: customerName || "Guest Customer",
        total: `${amount} ${currency}`.trim(),
        status: node.displayFinancialStatus || "-",
        fulfillmentStatus:
          node.displayFulfillmentStatus || "-",
        createdAt: node.createdAt || null,
      };
    });

  return {
    orders: orders.length,
    customers: customers.length,
    products: products.length,
    revenue: revenue.toFixed(2),
    recentOrders,
  };
}