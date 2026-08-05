export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const unauthorized = (m = "Not authenticated") => new HttpError(401, m);
export const forbidden = (m = "You do not have access to this resource") =>
  new HttpError(403, m);
export const notFound = (m = "Resource not found") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
