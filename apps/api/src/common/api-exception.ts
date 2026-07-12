import { HttpException, HttpStatus } from "@nestjs/common";

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    details?: unknown,
  ) {
    const body: ApiErrorBody = { code, message };
    if (details !== undefined) body.details = details;
    super(body, status);
  }
}
