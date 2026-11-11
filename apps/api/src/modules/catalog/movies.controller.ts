import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createMovieSchema,
  homeQuerySchema,
  idParamSchema,
  listMoviesQuerySchema,
  movieDetailQuerySchema,
  slugParamSchema,
  updateMovieSchema,
  type CreateMovieInput,
  type MovieDto,
  type UpdateMovieInput,
} from "@filmbooking/shared/schemas/catalog";
import { CurrentUser, Public, Roles, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { MoviesService, type HomeDto, type MovieFilters, type MovieScheduleDto } from "./movies.service";

@Controller()
export class MoviesController {
  constructor(@Inject(MoviesService) private readonly movies: MoviesService) {}

  @Public()
  @Get("home")
  home(@Query(new ZodValidationPipe(homeQuerySchema)) query: { province?: string }): Promise<HomeDto> {
    return this.movies.home(query.province);
  }

  @Public()
  @Get("movies")
  list(@Query(new ZodValidationPipe(listMoviesQuerySchema)) query: MovieFilters): Promise<MovieDto[]> {
    return this.movies.list(query);
  }

  @Public()
  @Get("movies/:slug")
  detail(
    @Param("slug", new ZodValidationPipe(slugParamSchema)) slug: string,
    @Query(new ZodValidationPipe(movieDetailQuerySchema)) query: { date?: string; province?: string },
  ): Promise<MovieScheduleDto> {
    return this.movies.detail(slug, query);
  }

  @Roles("ADMIN")
  @Get("admin/movies")
  listAll(@CurrentUser() user: AuthUser) {
    return this.movies.listAll(user.jwt);
  }

  @Roles("ADMIN")
  @Post("admin/movies")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMovieSchema)) body: CreateMovieInput,
  ): Promise<MovieDto> {
    return this.movies.create(user.jwt, body);
  }

  @Roles("ADMIN")
  @Patch("admin/movies/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateMovieSchema)) body: UpdateMovieInput,
  ): Promise<MovieDto> {
    return this.movies.update(user.jwt, id, body);
  }

  @Roles("ADMIN")
  @Delete("admin/movies/:id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idParamSchema)) id: string): Promise<void> {
    return this.movies.remove(user.jwt, id);
  }
}
