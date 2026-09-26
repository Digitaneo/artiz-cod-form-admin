import { Text } from "@shopify/polaris";

export default function PageHeader({
  title,
  subtitle,
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Text variant="heading2xl" as="h1">
        {title}
      </Text>

      {subtitle && (
        <Text tone="subdued" as="p">
          {subtitle}
        </Text>
      )}
    </div>
  );
}