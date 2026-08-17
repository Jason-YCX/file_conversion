import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../common/dto/api-error-response.dto";
import { CreateJobDto } from "./dto/create-job.dto";
import { JobResponseDto } from "./dto/job-response.dto";
import { JobsService } from "./jobs.service";
import type { Response } from "express";

@ApiTags("转换任务")
@Controller("jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @ApiOperation({
    summary: "创建图片转换任务",
    description:
      "校验已直传对象的大小和类型，将任务写入 PostgreSQL 并提交到转换队列。该接口当前不提供幂等键，请勿盲目重试。",
  })
  @ApiCreatedResponse({ description: "转换任务创建成功并进入队列", type: JobResponseDto })
  @ApiBadRequestResponse({
    description:
      "参数错误、上传对象不存在或对象信息不一致（STORAGE_OBJECT_NOT_FOUND / STORAGE_OBJECT_SIZE_MISMATCH / STORAGE_OBJECT_TYPE_MISMATCH）",
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: "转换队列暂时不可用（QUEUE_UNAVAILABLE）",
    type: ApiErrorResponseDto,
  })
  create(@Body() body: CreateJobDto) {
    return this.jobs.create(body);
  }

  @Get(":id")
  @ApiOperation({
    summary: "查询转换任务",
    description: "查询持久化任务状态；仅 completed 状态包含 output 下载信息。",
  })
  @ApiParam({ name: "id", description: "转换任务 ID", format: "uuid" })
  @ApiOkResponse({ description: "任务查询成功", type: JobResponseDto })
  @ApiBadRequestResponse({ description: "任务 ID 不是合法 UUID", type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: "任务不存在（JOB_NOT_FOUND）", type: ApiErrorResponseDto })
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.jobs.findOne(id);
  }

  @Get(":id/download")
  @ApiOperation({
    summary: "下载转换结果",
    description:
      "completed 状态下返回 302，并跳转到临时签名下载地址。服务端调用方应允许跟随重定向。",
  })
  @ApiParam({ name: "id", description: "转换任务 ID", format: "uuid" })
  @ApiFoundResponse({ description: "跳转到对象存储临时签名下载地址" })
  @ApiBadRequestResponse({ description: "任务 ID 不是合法 UUID", type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: "任务不存在（JOB_NOT_FOUND）", type: ApiErrorResponseDto })
  @ApiConflictResponse({ description: "任务尚未完成（JOB_NOT_COMPLETED）", type: ApiErrorResponseDto })
  @ApiResponse({
    status: 410,
    description: "文件已超过 2 小时保存期限（FILE_EXPIRED）",
    type: ApiErrorResponseDto,
  })
  async download(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Res() response: Response,
  ) {
    response.redirect(await this.jobs.download(id));
  }
}
