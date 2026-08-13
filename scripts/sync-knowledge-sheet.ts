import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { overwriteSheet, formatHeaderRow } from "../src/lib/google-sheets";

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

const SPREADSHEET_ID = process.env.KNOWLEDGE_SHEET_ID ?? "1QpmmdWszlpwqNq3WZQSPIigx3fbbgmzT0uD3KCTd9Qw";
const DB_PATH = process.env.KNOWLEDGE_DB_PATH ?? path.join(__dirname, "..", "data", "knowledge.db");
const MAX_CELL_CHARS = 40000; // Google Sheetsの1セル上限(5万文字)に対する安全マージン

async function main() {
  const sqlite = new Database(DB_PATH, { readonly: true });
  const db = drizzle(sqlite, { schema });

  const otas = db.select().from(schema.otas).orderBy(schema.otas.category, schema.otas.name).all();
  const facilities = db.select().from(schema.facilities).orderBy(schema.facilities.name).all();
  const entries = db.select().from(schema.knowledgeEntries).all();
  const otaById = new Map(otas.map((o) => [o.id, o]));
  const facilityById = new Map(facilities.map((f) => [f.id, f]));

  const withContent = entries.filter((e) => e.hasContent).length;
  const withDigest = entries.filter((e) => e.digest).length;
  const bySource = (s: string) => entries.filter((e) => e.source === s).length;

  console.log("[1/5] サマリー...");
  await overwriteSheet(SPREADSHEET_ID, "サマリー", [
    ["項目", "値"],
    ["更新日時", new Date().toISOString()],
    ["更新元", "HLS-project (github.com/kanazawa18-19/HLS-project) SQLite DB"],
    ["ナレッジ総数", entries.length],
    ["本文ありの件数", withContent],
    ["明文化(digest)済みの件数", withDigest],
    ["OTA/サイトコントローラー マスタ件数", otas.length],
    ["施設マスタ件数", facilities.length],
    ["内訳: Notion Proマニュアル", bySource("notion_pro_manual")],
    ["内訳: Notion ビデオマニュアル作成", bySource("notion_video_manual")],
    ["内訳: Drive公式PDFマニュアル", bySource("drive_pdf")],
    [null, null],
    [
      "このシートはHLS-projectで稼働中のナレッジベースDB(SQLite/Drizzle)と連動しています。" +
        "npm run db:seed / db:import-pdfs / db:interpret を実行すると自動的に反映されます。このシートを直接編集しても、次回同期時に上書きされます。",
      null,
    ],
  ]);
  await formatHeaderRow(SPREADSHEET_ID, "サマリー", 2);

  console.log("[2/5] OTAマスタ...");
  await overwriteSheet(SPREADSHEET_ID, "OTAマスタ", [
    ["ID", "名称", "区分", "管理画面URL", "公式ヘルプURL", "備考"],
    ...otas.map((o) => [o.id, o.name, o.category, o.adminUrl, o.helpUrl, o.notes]),
  ]);
  await formatHeaderRow(SPREADSHEET_ID, "OTAマスタ", 6);

  console.log("[3/5] 施設マスタ...");
  await overwriteSheet(SPREADSHEET_ID, "施設マスタ", [
    ["ID", "施設名", "チーム", "担当ディレクター", "AD(担当ディレクター不在時のエスカレーション先)", "備考"],
    ...facilities.map((f) => [f.id, f.name, f.teamName, f.directorName, f.adName, f.notes]),
  ]);
  await formatHeaderRow(SPREADSHEET_ID, "施設マスタ", 6);

  console.log("[4/5] ナレッジ一覧(索引)...");
  const indexRows = entries.map((e, i) => {
    const ota = e.otaId ? otaById.get(e.otaId) : undefined;
    const facility = e.facilityId ? facilityById.get(e.facilityId) : undefined;
    return [
      i + 1,
      e.title,
      ota?.category ?? "-",
      ota?.name ?? "未分類",
      facility?.name ?? "-",
      e.category ?? "未分類",
      e.tags ?? "-",
      e.hasContent ? "あり" : "要補完",
      e.digest ? "済" : "未",
      e.source,
      e.sourceUrl,
    ];
  });
  await overwriteSheet(SPREADSHEET_ID, "ナレッジ一覧(索引)", [
    ["No", "タイトル", "OTA区分", "OTA/サイトコントローラー", "施設", "業務カテゴリ", "タグ", "本文", "明文化", "出典", "リンク"],
    ...indexRows,
  ]);
  await formatHeaderRow(SPREADSHEET_ID, "ナレッジ一覧(索引)", 11);

  console.log("[5/5] ナレッジ本文(明文化済み)...");
  const digestEntries = entries.filter((e) => e.digest);
  const bodyRows = digestEntries.map((e, i) => {
    const ota = e.otaId ? otaById.get(e.otaId) : undefined;
    let digest = e.digest ?? "";
    if (digest.length > MAX_CELL_CHARS) {
      digest = `${digest.slice(0, MAX_CELL_CHARS)}\n\n...(以下省略、原文は「ナレッジ一覧(索引)」の出典リンク参照)`;
    }
    return [i + 1, e.title, ota?.name ?? "未分類", e.category ?? "未分類", digest, e.sourceUrl];
  });
  await overwriteSheet(SPREADSHEET_ID, "ナレッジ本文", [
    ["No", "タイトル", "OTA/サイトコントローラー", "業務カテゴリ", "明文化されたナレッジ", "出典URL"],
    ...bodyRows,
  ]);
  await formatHeaderRow(SPREADSHEET_ID, "ナレッジ本文", 6);

  const pendingCount = entries.filter((e) => e.hasContent && !e.digest).length;
  console.log(`\n完了: ナレッジ${entries.length}件を同期(明文化済み${digestEntries.length}件、未明文化${pendingCount}件)`);
  console.log(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);

  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
