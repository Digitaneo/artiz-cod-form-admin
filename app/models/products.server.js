export async function getProducts(admin) {

  const response = await admin.graphql(`
    query {

      products(first:50){

        edges{

          node{

            id

            title

            status

            totalInventory

          }

        }

      }

    }
  `);

  const json = await response.json();

  return json.data.products.edges.map(({ node }) => ({

    id: node.id,

    title: node.title,

    status: node.status,

    inventory: node.totalInventory,

  }));

}