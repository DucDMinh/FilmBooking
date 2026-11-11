import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { MeController } from "./me.controller";

@Module({ imports: [AuthModule], controllers: [MeController] })
export class MeModule {}
