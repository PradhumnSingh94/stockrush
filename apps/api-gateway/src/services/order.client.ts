import axios from "axios";
import { config } from "../config";
import {
  CreateOrderDto,
  OrderResponse,
  CORRELATION_ID_HEADER,
} from "@stockrush/shared";

const client = axios.create({
  baseURL: config.ORDER_SERVICE_URL,
  timeout: 5000,
});

export const OrderClient = {
  async create(
    dto: CreateOrderDto,
    correlationId: string,
  ): Promise<OrderResponse> {
    const { data } = await client.post("/orders", dto, {
      headers: { [CORRELATION_ID_HEADER]: correlationId },
    });
    return data;
  },
};
