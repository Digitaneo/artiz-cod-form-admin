import { api } from "./api";

export function getCustomers() {
  return api("/customers");
}

export function updateCustomer(id, data) {
  return api(`/customers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}