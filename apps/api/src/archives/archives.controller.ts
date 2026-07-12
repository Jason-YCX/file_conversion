import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { ArchivesService } from "./archives.service";
import { CreateArchiveDto } from "./dto/create-archive.dto";

@ApiTags("archives")
@Controller("archives")
export class ArchivesController {
  constructor(private readonly archives: ArchivesService) {}

  @Post()
  @ApiCreatedResponse({ description: "Creates an asynchronous ZIP archive task" })
  create(@Body() body: CreateArchiveDto) {
    return this.archives.create(body);
  }

  @Get(":id")
  @ApiOkResponse({ description: "Returns the durable archive task state" })
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.archives.findOne(id);
  }

  @Get(":id/download")
  @ApiOkResponse({ description: "Redirects to a signed ZIP download" })
  async download(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Res() response: Response,
  ) {
    response.redirect(await this.archives.download(id));
  }
}
