import { Banner } from "@shopify/polaris";

export default function ErrorBanner({ message }) {
  if (!message) return null;

  return (
    <Banner tone="critical">
      <p>{message}</p>
    </Banner>
  );
}