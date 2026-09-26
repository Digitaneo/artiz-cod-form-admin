import { useAppBridge } from "@shopify/app-bridge-react";

export function useShopifyToken() {
  const app = useAppBridge();

  async function getToken() {
    return await app.idToken();
  }

  return {
    getToken,
  };
}