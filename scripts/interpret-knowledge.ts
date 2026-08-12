import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { and, eq, isNull } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
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

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}

const DB_PATH = process.env.KNOWLEDGE_DB_PATH ?? path.join(__dirname, "..", "data", "knowledge.db");
const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite, { schema });
const client = new Anthropic();

const CONCURRENCY = 3;

function buildPrompt(title: string, otaName: string | null, category: string | null, rawText: string): string {
  return `以下はホテルOTA運用代行業務で使われている社内資料「${title}」` +
    `(対象OTA/サイトコントローラー: ${otaName ?? "不明"}${category ? `、業務カテゴリ: ${category}` : ""})の原文です。

---原文ここから---
${rawText}
---原文ここまで---

この資料を読み、現場スタッフが短時間で理解できる「ナレッジ」として明文化してください。次の3つの見出しで、日本語で出力してください。

■ 概要
(この資料が何についてのものか、1〜2文で)

■ 手順・ポイント
(具体的な操作手順やルールを箇条書きで。手順書でない資料(FAQ・注意事項集など)の場合は要点を箇条書きで)

■ 注意点
(見落としやすい点・禁止事項・例外・数値条件などがあれば箇条書きで。特になければ「特になし」と書く)

厳守事項:
- 原文の意味を変えないこと。原文にない情報を創作しないこと。
- 省略しすぎず、かつ冗長にならないよう簡潔にまとめること。
- 見出し以外の前置き・後書きは書かないこと。`;
}

async function interpretOne(entry: {
  title: string;
  body: string | null;
  otaName: string | null;
  category: string | null;
}): Promise<string> {
  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: "あなたはホテルOTA運用代行会社の社内ナレッジ整理を担当するアシスタントです。原文の意味を変えずに、現場スタッフが読みやすい形へ明文化します。",
    messages: [{ role: "user", content: buildPrompt(entry.title, entry.otaName, entry.category, entry.body ?? "") }],
  });
  const final = await stream.finalMessage();
  const textBlock = final.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

async function main() {
  migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });

  const targets = db
    .select()
    .from(schema.knowledgeEntries)
    .where(and(eq(schema.knowledgeEntries.hasContent, true), isNull(schema.knowledgeEntries.digest)))
    .all();

  const otaById = new Map(db.select().from(schema.otas).all().map((o) => [o.id, o.name]));

  console.log(`対象: ${targets.length}件(本文ありでdigest未生成のもの)`);
  if (targets.length === 0) {
    console.log("明文化対象はありません。");
    sqlite.close();
    return;
  }

  let done = 0;
  let failed = 0;
  await mapWithConcurrency(targets, CONCURRENCY, async (entry) => {
    try {
      const digest = await interpretOne({
        title: entry.title,
        body: entry.body,
        otaName: entry.otaId ? (otaById.get(entry.otaId) ?? null) : null,
        category: entry.category,
      });
      if (digest) {
        db.update(schema.knowledgeEntries)
          .set({ digest, updatedAt: new Date().toISOString() })
          .where(eq(schema.knowledgeEntries.id, entry.id))
          .run();
      }
      done++;
    } catch (error) {
      failed++;
      if (error instanceof Anthropic.AnthropicError) {
        console.error(`  ⚠ [${entry.id}] ${entry.title}: Anthropic APIエラー`, error.message);
      } else {
        console.error(`  ⚠ [${entry.id}] ${entry.title}: 予期しないエラー`, error);
      }
    }
    if ((done + failed) % 10 === 0 || done + failed === targets.length) {
      console.log(`  ...${done + failed}/${targets.length} (成功${done} / 失敗${failed})`);
    }
  });

  console.log(`\n完了: ${done}件を明文化(失敗${failed}件、digest未設定のまま。次回実行時に自動的に再試行されます)`);
  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
