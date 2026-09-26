import { useAppBridge } from "@shopify/app-bridge-react";

export function useSessionToken() {
  const shopify = useAppBridge();

  return async () => {
    return await shopify.idToken();
  };
}