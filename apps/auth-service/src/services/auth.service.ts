import argon2 from "argon2";
import { prisma } from "../db/prisma.client";
import { PasetoToken } from "../tokens/paseto";
import {
  AppError,
  ErrorCode,
  RegisterDto,
  LoginDto,
  AuthResponse,
} from "@stockrush/shared";

export const AuthService = {
  async register(dto: RegisterDto): Promise<AuthResponse> {
    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Email already registered",
        409,
      );
    }

    // Hash password with argon2
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id, // argon2id — recommended variant
      memoryCost: 65536, // 64MB memory — resist GPU attacks
      timeCost: 3, // 3 iterations
      parallelism: 4, // 4 threads
    });

    const user = await prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
      },
    });

    const token = await PasetoToken.issue({
      userId: user.id,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  },

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Same error for wrong email and wrong password
    // Never reveal which one failed — prevents user enumeration
    if (!user) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Invalid credentials",
        401,
      );
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);

    if (!valid) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Invalid credentials",
        401,
      );
    }

    const token = await PasetoToken.issue({
      userId: user.id,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, "User not found", 404);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  },
};
