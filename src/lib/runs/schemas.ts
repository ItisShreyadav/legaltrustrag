import { z } from "zod";
import { RUN_ID_PATTERN } from "./types";

/** Route param of /api/runs/[id] and /runs/[id]; a malformed id is answered like an unknown one (404). */
export const RunIdParam = z.object({ id: z.string().regex(RUN_ID_PATTERN) });
