import {
  Card,
  DataTable,
} from "@shopify/polaris";

export default function RecentOrders({
  orders,
}) {

  return (

    <Card>

      <DataTable

        columnContentTypes={[
          "text",
          "text",
          "text",
          "text",
        ]}

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

    </Card>

  );

}