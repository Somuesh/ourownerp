import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres instance.",
  );
}

export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
