import { Page } from "@shopify/polaris";

export default function AppLayout({

  title,

  subtitle,

  children,

}) {

  return (

    <Page

      title={title}

      subtitle={subtitle}

    >

      {children}

    </Page>

  );

}