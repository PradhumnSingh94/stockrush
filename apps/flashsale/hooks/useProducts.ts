import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Product } from "@/types";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.get<Product[]>("/api/products");
      return res.data;
    },
    refetchInterval: 30 * 1000, // refetch every 30s during flash sale
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: async () => {
      const res = await api.get<Product>(`/api/products/${id}`);
      return res.data;
    },
  });
}
