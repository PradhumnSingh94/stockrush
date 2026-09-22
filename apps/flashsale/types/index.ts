export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  flashSaleEndsAt?: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  userId: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "FULFILLED";
  items: OrderItem[];
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
