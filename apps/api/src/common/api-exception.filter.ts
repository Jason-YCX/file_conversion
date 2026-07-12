import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import type { ApiErrorBody } from "./api-exception";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.toErrorBody(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({ error: body });
  }

  private toErrorBody(exception: unknown): ApiErrorBody {
    if (!(exception instanceof HttpException)) {
      return {
        code: "INTERNAL_ERROR",
        message: "服务暂时不可用，请稍后重试",
      };
    }

    const response = exception.getResponse();
    if (typeof response === "string") {
      return { code: "HTTP_ERROR", message: response };
    }

    const value = response as Record<string, unknown>;
    if (typeof value.code === "string" && typeof value.message === "string") {
      return {
        code: value.code,
        message: value.message,
        ...(value.details === undefined ? {} : { details: value.details }),
      };
    }

    const validationMessages = Array.isArray(value.message)
      ? value.message
      : undefined;
    return {
      code: validationMessages ? "VALIDATION_ERROR" : "HTTP_ERROR",
      message:
        typeof value.message === "string"
          ? value.message
          : validationMessages
            ? "请求参数不正确"
            : exception.message,
      ...(validationMessages ? { details: validationMessages } : {}),
    };
  }
}
