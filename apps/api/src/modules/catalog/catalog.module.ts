import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { CinemasController } from "./cinemas.controller";
import { CinemasService } from "./cinemas.service";
import { MoviesController } from "./movies.controller";
import { MoviesService } from "./movies.service";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

/** Đăng ký vào AppModule ở task wiring (layer-4-task-07). SupabaseModule và ENV là global. */
@Module({
  imports: [AuthModule],
  controllers: [CinemasController, MoviesController, UploadsController],
  providers: [CinemasService, MoviesService, UploadsService],
})
export class CatalogModule {}
