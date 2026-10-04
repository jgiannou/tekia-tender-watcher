export class SaasError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = (message = "unauthorized") =>
  new SaasError(401, "unauthorized", message);

export const forbidden = (message = "forbidden") =>
  new SaasError(403, "forbidden", message);

export const notFound = (message = "not_found") =>
  new SaasError(404, "not_found", message);

export const badRequest = (message = "bad_request") =>
  new SaasError(400, "bad_request", message);

export const conflict = (message = "conflict") =>
  new SaasError(409, "conflict", message);

export const serviceUnavailable = (message = "service_unavailable") =>
  new SaasError(503, "service_unavailable", message);

export const kimdisUpstreamError = (message: string) =>
  new SaasError(502, "kimdis_error", message);
