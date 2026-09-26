import {
  Card,
  DataTable,
} from "@shopify/polaris";

export default function AppTable({
  headings,
  rows,
}) {
  return (
    <Card>
      <DataTable
        columnContentTypes={headings.map(() => "text")}
        headings={headings}
        rows={rows}
      />
    </Card>
  );
}