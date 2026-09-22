import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Order } from "@/types";
import { AuthStorage } from "@/lib/auth";

export function useOrders() {
  const user = AuthStorage.getUser();

  return useQuery({
    queryKey: ["orders", user?.id],
    queryFn: async () => {
      const res = await api.get<Order[]>(`/api/orders/user/${user?.id}`);
      return res.data;
    },
    enabled: !!user?.id,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  const user = AuthStorage.getUser();

  return useMutation({
    mutationFn: async (data: {
      items: Array<{ productId: string; quantity: number }>;
    }) => {
      const res = await api.post<Order>("/api/orders", {
        userId: user?.id,
        userEmail: user?.email,
        ...data,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
