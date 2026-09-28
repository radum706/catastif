export class ApiError extends Error {
  constructor(
    public code: "not_found" | "invalid" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function notFound(what: string): never {
  throw new ApiError("not_found", `${what} not found`);
}

export function invalid(message: string): never {
  throw new ApiError("invalid", message);
}
