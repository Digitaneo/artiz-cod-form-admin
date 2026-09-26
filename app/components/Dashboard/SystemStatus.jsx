import {
  Card,
  List,
  Badge,
} from "@shopify/polaris";

export default function SystemStatus({

  status,

}) {

  return (

    <Card>

      <List>

        <List.Item>

          Worker

          <Badge
            tone={
              status.worker
                ? "success"
                : "critical"
            }
          >
            {status.worker ? "OK" : "Error"}
          </Badge>

        </List.Item>

        <List.Item>

          KV

          <Badge
            tone={
              status.kv
                ? "success"
                : "critical"
            }
          >
            {status.kv ? "OK" : "Error"}
          </Badge>

        </List.Item>

        <List.Item>

          Access Token

          <Badge
            tone={
              status.accessToken
                ? "success"
                : "critical"
            }
          >
            {status.accessToken ? "OK" : "Error"}
          </Badge>

        </List.Item>

        <List.Item>

          Shopify API

          <Badge
            tone={
              status.shopify
                ? "success"
                : "critical"
            }
          >
            {status.shopify ? "OK" : "Error"}
          </Badge>

        </List.Item>

      </List>

    </Card>

  );

}