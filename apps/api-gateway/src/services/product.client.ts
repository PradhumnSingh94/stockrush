import axios from "axios";
import { config } from "../config";
import {
  CreateProductDto,
  ProductResponse,
  CORRELATION_ID_HEADER,
} from "@stockrush/shared";

const client = axios.create({
  baseURL: config.PRODUCT_SERVICE_URL,
  timeout: 5000,
});

export const ProductClient = {
  async create(
    dto: CreateProductDto,
    correlationId: string,
  ): Promise<ProductResponse> {
    const { data } = await client.post("/products", dto, {
      headers: { [CORRELATION_ID_HEADER]: correlationId },
    });
    return data;
  },

  async findById(id: string, correlationId: string): Promise<ProductResponse> {
    const { data } = await client.get(`/products/${id}`, {
      headers: { [CORRELATION_ID_HEADER]: correlationId },
    });
    return data;
  },

  async list(correlationId: string): Promise<ProductResponse[]> {
    const { data } = await client.get("/products", {
      headers: { [CORRELATION_ID_HEADER]: correlationId },
    });
    return data;
  },
};
