import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CreateJobDto } from "./dto/create-job.dto";
import { JobsService } from "./jobs.service";
import type { Response } from "express";

@ApiTags("jobs")
@Controller("jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @ApiCreatedResponse({ description: "Creates a queued conversion job" })
  create(@Body() body: CreateJobDto) {
    return this.jobs.create(body);
  }

  @Get(":id")
  @ApiOkResponse({ description: "Returns the durable job state" })
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.jobs.findOne(id);
  }

  @Get(":id/download")
  @ApiOkResponse({ description: "Redirects to a signed converted-file download" })
  async download(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Res() response: Response,
  ) {
    response.redirect(await this.jobs.download(id));
  }
}
