import { z } from "zod";

export const meCinemaSchema = z.object({
  cinemaId: z.string(),
  role: z.enum(["STAFF", "MANAGER"]),
});

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  emailConfirmed: z.boolean(),
  isAdmin: z.boolean(),
  cinemas: z.array(meCinemaSchema),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
