import { api } from "./api";

export function getOrders() {
  return api("/orders");
}

export function getOrder(id) {
  return api(`/orders/${id}`);
}