import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ApiErrorDto {
  @ApiProperty({
    description: "稳定的机器可读错误码，调用方应优先依据该字段处理错误",
    example: "VALIDATION_ERROR",
    type: String,
  })
  code: string;

  @ApiProperty({
    description: "面向用户或开发者的中文错误说明",
    example: "请求参数不正确",
    type: String,
  })
  message: string;

  @ApiPropertyOptional({
    description: "可选的错误详情，结构随错误码变化",
    example: ["quality must not be greater than 100"],
    type: Object,
  })
  details?: unknown;
}

export class ApiErrorResponseDto {
  @ApiProperty({ description: "统一错误信息", type: ApiErrorDto })
  error: ApiErrorDto;
}
