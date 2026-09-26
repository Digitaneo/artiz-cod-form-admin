import { api } from "./api";

export function getProducts() {
  return api("/products");
}

export function updateProduct(id, data) {
  return api(`/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}