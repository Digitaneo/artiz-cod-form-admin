import { Spinner } from "@shopify/polaris";

export default function Loading() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "40px",
      }}
    >
      <Spinner size="large" />
    </div>
  );
}