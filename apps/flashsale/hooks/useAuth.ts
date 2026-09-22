import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AuthStorage } from "@/lib/auth";
import { AuthResponse } from "@/types";
import { useRouter } from "next/navigation";

export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await api.post<AuthResponse>("/api/auth/login", data);
      return res.data;
    },
    onSuccess: (data) => {
      AuthStorage.setToken(data.token);
      AuthStorage.setUser(data.user);
      queryClient.invalidateQueries({ queryKey: ["user"] });
      router.push("/products");
    },
  });
}

export function useRegister() {
  const router = useRouter();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      name: string;
    }) => {
      const res = await api.post<AuthResponse>("/api/auth/register", data);
      return res.data;
    },
    onSuccess: (data) => {
      AuthStorage.setToken(data.token);
      AuthStorage.setUser(data.user);
      router.push("/products");
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return () => {
    AuthStorage.clear();
    queryClient.clear();
    router.push("/login");
  };
}
