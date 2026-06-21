import { z } from "zod";

export const LocationPayloadSchema = z.object({
  runnerId: z.union([z.string(), z.number()]).transform(String),
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
  accuracy: z.number().optional().nullable(),
  speed: z.number().optional().nullable(),
  bearing: z.number().optional().nullable(),
  altitude: z.number().optional().nullable(),
  battery: z.number().min(0).max(100).optional().nullable(),
  ts: z.number().int().positive(),
});

export type LocationPayload = z.infer<typeof LocationPayloadSchema>;

export const LocationBatchSchema = z.array(LocationPayloadSchema).min(1).max(1000);
