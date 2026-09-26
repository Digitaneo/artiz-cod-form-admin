import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

import { getOrders } from "../models/orders.server";

import AppLayout from "../components/AppLayout";
import AppTable from "../components/DataTable";

export async function loader({ request }) {

  const { admin } = await authenticate.admin(request);

  const orders = await getOrders(admin);

  return { orders };

}

export default function Orders() {

  const { orders } = useLoaderData();

  return (

    <AppLayout
      title="Orders"
      subtitle="Manage COD Orders"
    >

      <AppTable

        headings={[
          "Order",
          "Customer",
          "Total",
          "Status",
        ]}

        rows={orders.map(order => [

          order.orderNumber,

          order.customer,

          order.total,

          order.status,

        ])}

      />

    </AppLayout>

  );

}