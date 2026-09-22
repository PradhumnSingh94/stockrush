export enum ErrorCode {
  NOT_FOUND = "NOT_FOUND",
  STOCK_INSUFFICIENT = "STOCK_INSUFFICIENT",
  FLASH_SALE_ENDED = "FLASH_SALE_ENDED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}