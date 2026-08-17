import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthResponseDto } from "./dto/health-response.dto";
import { HealthService } from "./health.service";

@ApiTags("健康检查")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: "查询服务健康状态",
    description: "检查 PostgreSQL、Redis、对象存储和转换 Worker 是否可用。",
  })
  @ApiOkResponse({ description: "健康状态查询成功", type: HealthResponseDto })
  check() {
    return this.health.check();
  }
}
