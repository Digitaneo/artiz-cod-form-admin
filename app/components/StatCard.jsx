import { Card, Text, BlockStack } from "@shopify/polaris";

export default function StatCard({

  title,

  value,

}) {

  return (

    <Card>

      <BlockStack gap="200">

        <Text
          as="h3"
          variant="headingSm"
          tone="subdued"
        >
          {title}
        </Text>

        <Text
          as="p"
          variant="heading2xl"
        >
          {value}
        </Text>

      </BlockStack>

    </Card>

  );

}