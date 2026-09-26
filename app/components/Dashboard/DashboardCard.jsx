import { Card, Text } from "@shopify/polaris";

export default function DashboardCard({
  title,
  value,
}) {
  return (
    <Card>
      <div
        style={{
          padding: "24px",
          textAlign: "center",
        }}
      >
        <Text
          as="h3"
          variant="headingMd"
        >
          {title}
        </Text>

        <div
          style={{
            marginTop: "12px",
          }}
        >
          <Text
            as="p"
            variant="heading2xl"
          >
            {value}
          </Text>
        </div>
      </div>
    </Card>
  );
}