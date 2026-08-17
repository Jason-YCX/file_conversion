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
import type { Response } from "express";
import { ApiErrorResponseDto } from "../common/dto/api-error-response.dto";
import { ArchiveResponseDto } from "./dto/archive-response.dto";
import { ArchivesService } from "./archives.service";
import { CreateArchiveDto } from "./dto/create-archive.dto";

@ApiTags("批量下载")
@Controller("archives")
export class ArchivesController {
  constructor(private readonly archives: ArchivesService) {}

  @Post()
  @ApiOperation({
    summary: "创建 ZIP 打包任务",
    description: "将 1 至 10 个已完成的转换任务异步打包为 ZIP。",
  })
  @ApiCreatedResponse({ description: "压缩任务创建成功并进入队列", type: ArchiveResponseDto })
  @ApiBadRequestResponse({ description: "请求参数或任务 ID 格式不正确", type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: "部分转换任务不存在（JOB_NOT_FOUND）", type: ApiErrorResponseDto })
  @ApiConflictResponse({
    description: "存在未完成的转换任务（JOBS_NOT_READY）",
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: "打包队列暂时不可用（ARCHIVE_QUEUE_UNAVAILABLE）",
    type: ApiErrorResponseDto,
  })
  create(@Body() body: CreateArchiveDto) {
    return this.archives.create(body);
  }

  @Get(":id")
  @ApiOperation({
    summary: "查询 ZIP 打包任务",
    description: "查询压缩任务状态；仅 completed 状态包含 output 下载信息。",
  })
  @ApiParam({ name: "id", description: "压缩任务 ID", format: "uuid" })
  @ApiOkResponse({ description: "压缩任务查询成功", type: ArchiveResponseDto })
  @ApiBadRequestResponse({ description: "任务 ID 不是合法 UUID", type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    description: "压缩任务不存在（ARCHIVE_NOT_FOUND）",
    type: ApiErrorResponseDto,
  })
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.archives.findOne(id);
  }

  @Get(":id/download")
  @ApiOperation({
    summary: "下载 ZIP 压缩包",
    description:
      "completed 状态下返回 302，并跳转到临时签名下载地址。服务端调用方应允许跟随重定向。",
  })
  @ApiParam({ name: "id", description: "压缩任务 ID", format: "uuid" })
  @ApiFoundResponse({ description: "跳转到对象存储临时签名下载地址" })
  @ApiBadRequestResponse({ description: "任务 ID 不是合法 UUID", type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    description: "压缩任务不存在（ARCHIVE_NOT_FOUND）",
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description: "压缩包尚未生成完成（ARCHIVE_NOT_COMPLETED）",
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 410,
    description: "压缩包已超过 2 小时保存期限（FILE_EXPIRED）",
    type: ApiErrorResponseDto,
  })
  async download(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Res() response: Response,
  ) {
    response.redirect(await this.archives.download(id));
  }
}
