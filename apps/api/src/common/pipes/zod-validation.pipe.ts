import type { PipeTransform } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import type { z } from "zod";
import { AppException } from "../errors/app-exception";

/** Dùng: `@Body(new ZodValidationPipe(schema)) dto`. Sai dữ liệu -> 400 VALIDATION_ERROR kèm `details.issues`. */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<unknown, z.output<TSchema>> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Validation failed", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
  }
}
