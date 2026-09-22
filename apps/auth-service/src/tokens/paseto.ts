import { V4 } from "paseto";
import { config } from "../config";

export interface TokenPayload {
  userId: string;
  email: string;
  iat?: string;
}

export const PasetoToken = {
  async issue(payload: TokenPayload): Promise<string> {
    return V4.sign(
      {
        ...payload,
        iat: new Date().toISOString(),
      },
      config.PASETO_SECRET_KEY,
      {
        expiresIn: config.TOKEN_EXPIRY,
      },
    );
  },

  async verify(token: string): Promise<TokenPayload> {
    const payload = await V4.verify(token, config.PASETO_PUBLIC_KEY);
    return payload as unknown as TokenPayload;
  },
};
