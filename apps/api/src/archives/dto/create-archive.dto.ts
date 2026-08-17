import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from "class-validator";

export class CreateArchiveDto {
  @ApiProperty({
    description: "需要打包的已完成转换任务 ID；所有任务都必须处于 completed 状态",
    type: [String],
    minItems: 1,
    maxItems: 10,
    example: ["e6b659c5-ef1a-4f7b-b226-abf380ca5991"],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  jobIds: string[];
}
