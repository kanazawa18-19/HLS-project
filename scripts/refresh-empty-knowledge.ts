/**
 * 本文が空(has_content=false)のまま残っているNotion由来のナレッジエントリを再チェックする。
 * db-seed.tsのdedupはsourceId単位で「一度取り込んだページは二度と本文を取りに行かない」設計のため、
 * 後からNotion側でページの中身が埋められた場合に追従するにはこのスクリプトが必要。
 *
 * 使い方: npx tsx scripts/refresh-empty-knowledge.ts
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, like } from "drizzle-orm";
import * as schema from "../src/db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}
loadDotEnvLocal();

const NOTION_API_KEY = process.env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  console.error("NOTION_API_KEY is not set");
  process.exit(1);
}

const DB_PATH = process.env.KNOWLEDGE_DB_PATH ?? path.join(__dirname, "..", "data", "knowledge.db");
const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite, { schema });

interface NotionRichText {
  plain_text?: string;
}
interface NotionBlockContent {
  rich_text?: NotionRichText[];
}
interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}
interface NotionBlocksResponse {
  object: string;
  results?: NotionBlock[];
  has_more?: boolean;
  next_cursor?: string | null;
  message?: string;
}

function blockPlainText(block: NotionBlock): string {
  const content = block[block.type] as NotionBlockContent | undefined;
  const richText = content?.rich_text ?? [];
  return richText.map((t) => t.plain_text ?? "").join("");
}

async function fetchPageBodyText(pageId: string, depth = 0): Promise<{ lines: string[]; ok: boolean }> {
  if (depth > 3) return { lines: [], ok: true };
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${NOTION_API_KEY}`, "Notion-Version": "2022-06-28" } });
    } catch (error) {
      console.error(`  ⚠ ${pageId}: ネットワークエラー`, error);
      return { lines, ok: false };
    }
    const data: NotionBlocksResponse = await res.json();
    if (data.object === "error") {
      console.error(`  ⚠ ${pageId}: Notion APIエラー (${res.status})`, data.message);
      return { lines, ok: false };
    }
    for (const block of data.results ?? []) {
      const text = blockPlainText(block);
      if (text) lines.push(text);
      else if (block.type === "image") lines.push("[画像]");
      if (block.has_children) {
        const child = await fetchPageBodyText(block.id, depth + 1);
        lines.push(...child.lines);
        if (!child.ok) return { lines, ok: false };
      }
    }
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return { lines, ok: true };
}

function extractNotionPageId(sourceId: string): string | null {
  const match = sourceId.match(/^notion:(.+)$/);
  return match ? match[1] : null;
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

async function main() {
  const targets = db
    .select()
    .from(schema.knowledgeEntries)
    .where(and(eq(schema.knowledgeEntries.hasContent, false), like(schema.knowledgeEntries.source, "notion_%")))
    .all();

  console.log(`対象: ${targets.length}件(Notion由来で本文が空のもの)を再チェックします`);

  let filled = 0;
  let stillEmpty = 0;
  let failed = 0;
  let done = 0;

  await mapWithConcurrency(targets, 5, async (entry) => {
    const pageId = entry.sourceId ? extractNotionPageId(entry.sourceId) : null;
    if (!pageId) {
      failed++;
      return;
    }
    const result = await fetchPageBodyText(pageId);
    done++;
    if (!result.ok) {
      failed++;
    } else {
      const body = result.lines.join("\n");
      if (body.length > 0) {
        db.update(schema.knowledgeEntries)
          .set({ body, hasContent: true, updatedAt: new Date().toISOString() })
          .where(eq(schema.knowledgeEntries.id, entry.id))
          .run();
        filled++;
      } else {
        stillEmpty++;
      }
    }
    if (done % 50 === 0 || done === targets.length) {
      console.log(`  ...${done}/${targets.length} (新規に本文あり${filled} / 依然空${stillEmpty} / 失敗${failed})`);
    }
  });

  console.log(`\n完了: ${filled}件に新たに本文が見つかりました(依然空${stillEmpty}件、取得失敗${failed}件は次回リトライ対象)`);
  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
