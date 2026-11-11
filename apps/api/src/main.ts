import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./config/configure-app";
import { ENV, EnvValidationError, type Env } from "./config/env";

async function bootstrap(): Promise<void> {
  // abortOnError:false để lỗi cấu hình đi vào catch bên dưới thay vì process.abort() của Nest.
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const env = app.get<Env>(ENV);
  configureApp(app, env);
  app.enableShutdownHooks();
  await app.listen(env.PORT, "0.0.0.0");
  Logger.log(`API listening on port ${env.PORT}`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger("Bootstrap");
  if (error instanceof EnvValidationError) {
    logger.error(`${error.message} (variables: ${error.variables.join(", ")})`);
  } else {
    logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  }
  process.exit(1);
});
