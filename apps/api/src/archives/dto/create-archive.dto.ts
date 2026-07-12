import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from "class-validator";

export class CreateArchiveDto {
  @ApiProperty({
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
