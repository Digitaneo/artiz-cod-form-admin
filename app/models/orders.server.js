export async function getOrders(admin) {

  const response = await admin.graphql(`
    query {

      orders(first:20, reverse:true) {

        edges {

          node {

            id

            name

            displayFinancialStatus

            totalPriceSet {

              shopMoney {

                amount

                currencyCode

              }

            }

            customer {

              firstName

              lastName

            }

          }

        }

      }

    }
  `);

  const json = await response.json();

  return json.data.orders.edges.map(({ node }) => ({

    id: node.id,

    orderNumber: node.name,

    customer:
      node.customer
        ? `${node.customer.firstName ?? ""} ${node.customer.lastName ?? ""}`.trim()
        : "-",

    total:
      `${node.totalPriceSet.shopMoney.amount} ${node.totalPriceSet.shopMoney.currencyCode}`,

    status: node.displayFinancialStatus,

  }));

}