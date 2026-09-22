import axios from "axios";
import { config } from "../config";
import {
  RegisterDto,
  LoginDto,
  AuthResponse,
  CORRELATION_ID_HEADER,
} from "@stockrush/shared";

const client = axios.create({
  baseURL: config.AUTH_SERVICE_URL,
  timeout: 5000,
});

export const AuthClient = {
  async register(
    dto: RegisterDto,
    correlationId: string,
  ): Promise<AuthResponse> {
    const { data } = await client.post("/auth/register", dto, {
      headers: { [CORRELATION_ID_HEADER]: correlationId },
    });
    return data;
  },

  async login(dto: LoginDto, correlationId: string): Promise<AuthResponse> {
    const { data } = await client.post("/auth/login", dto, {
      headers: { [CORRELATION_ID_HEADER]: correlationId },
    });
    return data;
  },
};
