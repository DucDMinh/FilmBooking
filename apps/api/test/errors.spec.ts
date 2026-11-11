import {
  Body,
  Controller,
  Get,
  HttpException,
  NotFoundException,
  Post,
  type INestApplication,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ERROR_CODES } from "@filmbooking/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { AppException } from "../src/common/errors/app-exception";
import { ZodValidationPipe } from "../src/common/pipes/zod-validation.pipe";

const SECRET = "postgres://user:hunter2@db.internal/prod";
const createSchema = z.object({ name: z.string().min(1) });

@Controller("probe")
class ProbeController {
  @Get("unknown")
  unknown(): never {
    throw new Error(`connection failed ${SECRET}`);
  }

  @Get("seat")
  seat(): never {
    throw new AppException(ERROR_CODES.SEAT_TAKEN, "Seat A1 is taken", { seats: ["A1"] });
  }

  @Get("bare-http")
  bareHttp(): never {
    throw new NotFoundException("Showtime not found");
  }

  @Get("throttled")
  throttled(): never {
    throw new HttpException("Too Many Requests", 429);
  }

  @Get("app-500")
  app500(): never {
    throw new AppException(ERROR_CODES.INTERNAL_ERROR, `db down ${SECRET}`, { dsn: SECRET });
  }

  @Get("http-500")
  http500(): never {
    throw new HttpException(`leak ${SECRET}`, 500);
  }

  @Post("create")
  create(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return body;
  }
}

describe("global exception filter", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("maps an unknown error to 500 INTERNAL_ERROR without leaking stack or message", async () => {
    const response = await request(app.getHttpServer()).get("/probe/unknown");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(response.text).not.toContain("hunter2");
    expect(response.text).not.toContain("at ");
  });

  it("does not leak the message of an HttpException with status >= 500", async () => {
    const response = await request(app.getHttpServer()).get("/probe/http-500");
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(response.text).not.toContain("hunter2");
  });

  it("does not leak message/details of an AppException with status >= 500", async () => {
    const response = await request(app.getHttpServer()).get("/probe/app-500");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    expect(response.text).not.toContain("hunter2");
  });

  it("maps AppException(SEAT_TAKEN) to 409 with the exact error shape", async () => {
    const response = await request(app.getHttpServer()).get("/probe/seat");
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: "SEAT_TAKEN", message: "Seat A1 is taken", details: { seats: ["A1"] } },
    });
  });

  it("maps bare Nest HttpExceptions and unknown routes to catalog codes", async () => {
    const notFound = await request(app.getHttpServer()).get("/probe/bare-http");
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ error: { code: "NOT_FOUND", message: "Showtime not found" } });

    const missingRoute = await request(app.getHttpServer()).get("/nope");
    expect(missingRoute.status).toBe(404);
    expect(missingRoute.body.error.code).toBe("NOT_FOUND");

    const throttled = await request(app.getHttpServer()).get("/probe/throttled");
    expect(throttled.status).toBe(429);
    expect(throttled.body.error.code).toBe("RATE_LIMITED");
  });

  it("returns 400 VALIDATION_ERROR for malformed JSON instead of 500", async () => {
    const response = await request(app.getHttpServer())
      .post("/probe/create")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("ZodValidationPipe", () => {
  it("returns parsed data when valid", () => {
    expect(new ZodValidationPipe(createSchema).transform({ name: "Dune" })).toEqual({ name: "Dune" });
  });

  it("throws AppException VALIDATION_ERROR (400) with issue paths when invalid", () => {
    const pipe = new ZodValidationPipe(createSchema);
    try {
      pipe.transform({ name: "" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const exception = error as AppException;
      expect(exception.getStatus()).toBe(400);
      expect(exception.code).toBe("VALIDATION_ERROR");
      expect(exception.details).toMatchObject({ issues: [{ path: "name" }] });
    }
  });
});

describe("AppException", () => {
  it("takes its HTTP status from the shared catalog", () => {
    expect(new AppException(ERROR_CODES.SEAT_TAKEN).getStatus()).toBe(409);
    expect(new AppException(ERROR_CODES.HOLD_EXPIRED).getStatus()).toBe(410);
    expect(new AppException(ERROR_CODES.FORBIDDEN_CINEMA).getStatus()).toBe(403);
  });
});
