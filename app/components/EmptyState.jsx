import { EmptyState } from "@shopify/polaris";

export default function AppEmptyState({
  heading,
  action,
  image,
  children,
}) {
  return (
    <EmptyState
      heading={heading}
      action={action}
      image={image}
    >
      {children}
    </EmptyState>
  );
}