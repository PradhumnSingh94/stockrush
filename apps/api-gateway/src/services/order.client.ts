import axios from "axios";
import {
  AppError,
  CreateOrderDto,
  ErrorCode,
  OrderResponse,
  CORRELATION_ID_HEADER,
} from "@stockrush/shared";
import { config } from "../config";

const client = axios.create({
  baseURL: config.ORDER_SERVICE_URL,
  timeout: 10_000,
});

export const OrderClient = {
  async create(
    dto: CreateOrderDto,
    correlationId: string,
    idempotencyKey: string,
  ): Promise<OrderResponse> {
    try {
      const { data } = await client.post<OrderResponse>("/orders", dto, {
        headers: {
          [CORRELATION_ID_HEADER]: correlationId,
          "X-Idempotency-Key": idempotencyKey,
        },
      });
      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const response = error.response;
        if (response) {
          const body = response.data as { code?: ErrorCode; message?: string };
          const status = response.status >= 400 && response.status <= 599
            ? response.status
            : 502;
          throw new AppError(
            body?.code ?? ErrorCode.INTERNAL_ERROR,
            body?.message ?? "Order Service rejected the request",
            status,
          );
        }

        // Network timeout/connection error is an ambiguous result; preserve the
        // client idempotency key and reconcile instead of issuing a new order.
        throw new AppError(
          ErrorCode.SERVICE_UNAVAILABLE,
          "Order Service response is unknown; retry with the same idempotency key",
          503,
        );
      }
      throw error;
    }
  },
};
