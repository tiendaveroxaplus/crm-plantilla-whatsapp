import postgres from "postgres";
import { requireEnv } from "@/lib/env";

let client: ReturnType<typeof postgres> | undefined;

export function db() {
  if (!client) {
    client = postgres(requireEnv("DATABASE_URL"), {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}

export async function databaseHealth() {
  const result = await db()`select 1 as ok`;
  return result[0]?.ok === 1;
}
