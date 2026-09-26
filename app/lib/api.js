import { useShopifyToken } from "./shopify";

const API_URL =
  "https://artiz-cod-form.digitaneo.workers.dev";

export function useApi() {

  const { getToken } = useShopifyToken();

  async function request(path, options = {}) {

    const token = await getToken();

    const response = await fetch(

      `${API_URL}${path}`,

      {

        ...options,

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,

          ...(options.headers || {}),

        },

      }

    );

    if (!response.ok) {

      throw new Error(

        await response.text()

      );

    }

    return await response.json();

  }

  return {

    request,

  };

}