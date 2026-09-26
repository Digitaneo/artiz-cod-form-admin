import {
  Card,
  IndexTable,
  Text,
} from "@shopify/polaris";

export default function RecentOrders({ orders }) {

  return (

    <Card>

      <Text
        as="h2"
        variant="headingMd"
      >
        Recent Orders
      </Text>

      <IndexTable

        resourceName={{
          singular: "order",
          plural: "orders",
        }}

        itemCount={orders.length}

        headings={[
          { title: "Order" },
          { title: "Customer" },
          { title: "Total" },
          { title: "Status" },
        ]}

        selectable={false}

      >

        {orders.map((order, index) => (

          <IndexTable.Row

            id={order.id}

            key={order.id}

            position={index}

          >

            <IndexTable.Cell>

              {order.orderNumber}

            </IndexTable.Cell>

            <IndexTable.Cell>

              {order.customer}

            </IndexTable.Cell>

            <IndexTable.Cell>

              {order.total}

            </IndexTable.Cell>

            <IndexTable.Cell>

              {order.status}

            </IndexTable.Cell>

          </IndexTable.Row>

        ))}

      </IndexTable>

    </Card>

  );

}