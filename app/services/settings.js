import { api } from "./api";

export function getSettings(shop) {
  return api(`/settings?shop=${shop}`);
}

export function saveSettings(data) {
  return api("/settings/save", {
    method: "POST",
    body: JSON.stringify(data),
  });
}