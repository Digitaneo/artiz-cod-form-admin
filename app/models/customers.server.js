export async function getCustomers(admin){

    const response = await admin.graphql(`
    query{

        customers(first:50){

            edges{

                node{

                    id

                    firstName

                    lastName

                    email

                }

            }

        }

    }
    `);

    const json = await response.json();

    return json.data.customers.edges.map(({node})=>({

        id:node.id,

        name:`${node.firstName ?? ""} ${node.lastName ?? ""}`,

        email:node.email,

    }));

}