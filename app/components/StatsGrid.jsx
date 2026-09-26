import { InlineGrid } from "@shopify/polaris";

export default function StatsGrid({

  children,

}) {

  return (

    <InlineGrid

      columns={4}

      gap="400"

    >

      {children}

    </InlineGrid>

  );

}