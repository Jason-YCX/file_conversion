import { ApiProperty } from "@nestjs/swagger";

export class HealthServicesDto {
  @ApiProperty({ description: "PostgreSQL 状态", enum: ["up", "down"], example: "up" })
  database: "up" | "down";

  @ApiProperty({ description: "Redis 状态", enum: ["up", "down"], example: "up" })
  redis: "up" | "down";

  @ApiProperty({ description: "对象存储状态", enum: ["up", "down"], example: "up" })
  storage: "up" | "down";
}

export class HealthResponseDto {
  @ApiProperty({
    description: "API 依赖总体状态；转换 Worker 不参与总体状态计算",
    enum: ["ok", "degraded"],
    example: "ok",
  })
  status: "ok" | "degraded";

  @ApiProperty({ description: "基础依赖状态", type: HealthServicesDto })
  services: HealthServicesDto;

  @ApiProperty({
    description: "转换 Worker 是否在线",
    enum: ["enabled", "disabled"],
    example: "enabled",
  })
  conversionEngine: "enabled" | "disabled";

  @ApiProperty({
    description: "服务端检查时间（ISO 8601）",
    example: "2026-08-17T08:00:00.000Z",
    type: String,
  })
  timestamp: string;
}
