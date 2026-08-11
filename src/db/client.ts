import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

const DB_PATH = process.env.KNOWLEDGE_DB_PATH ?? path.join(process.cwd(), "data", "knowledge.db");

let sqlite: InstanceType<typeof Database> | null = null;

export function getDb() {
  if (!sqlite) {
    sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
  }
  return drizzle(sqlite, { schema });
}
