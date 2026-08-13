import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import * as schema from "../src/db/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.KNOWLEDGE_DB_PATH ?? path.join(__dirname, "..", "data", "knowledge.db");
const OUT_PATH = process.env.KNOWLEDGE_EXCEL_PATH ?? path.join(process.env.HOME ?? "", "Desktop", "ナレッジベース_エクスポート.xlsx");

// 1セルあたりの安全な上限(Excelの実上限は32,767文字)
const MAX_CELL_CHARS = 30000;

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF305496" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
const CATEGORY_FILL: Record<string, ExcelJS.Fill> = {
  国内OTA: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } },
  海外OTA: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } },
  サイトコントローラー: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } },
  その他: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } },
};
const LINK_FONT: Partial<ExcelJS.Font> = { color: { argb: "FF0563C1" }, underline: true, size: 9.5 };
const WRAP: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: "top" };
const WRAP_CENTER: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: "middle", horizontal: "center" };
const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FFBFBFBF" } };
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, bottom: THIN, left: THIN, right: THIN };

function headerRow(ws: ExcelJS.Worksheet, headers: string[]) {
  const row = ws.addRow(headers);
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = WRAP_CENTER;
    cell.border = BORDER;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

async function main() {
  const sqlite = new Database(DB_PATH, { readonly: true });
  const db = drizzle(sqlite, { schema });

  const otas = db.select().from(schema.otas).orderBy(schema.otas.category, schema.otas.name).all();
  const facilities = db.select().from(schema.facilities).orderBy(schema.facilities.name).all();
  const entries = db.select().from(schema.knowledgeEntries).all();
  const otaById = new Map(otas.map((o) => [o.id, o]));
  const facilityById = new Map(facilities.map((f) => [f.id, f]));

  const wb = new ExcelJS.Workbook();

  // --- サマリー ---
  const wsSummary = wb.addWorksheet("サマリー");
  wsSummary.columns = [{ width: 34 }, { width: 60 }];
  const withContent = entries.filter((e) => e.hasContent).length;
  const bySource = (s: string) => entries.filter((e) => e.source === s).length;
  const summaryRows: [string, string | number][] = [
    ["エクスポート日時", new Date().toISOString()],
    ["エクスポート元", "HLS-project (github.com/kanazawa18-19/HLS-project) SQLite DB"],
    ["ナレッジ総数", entries.length],
    ["本文ありの件数", withContent],
    ["OTA/サイトコントローラー マスタ件数", otas.length],
    ["施設マスタ件数", facilities.length],
    ["内訳: Notion Proマニュアル", bySource("notion_pro_manual")],
    ["内訳: Notion ビデオマニュアル作成", bySource("notion_video_manual")],
    ["内訳: Drive公式PDFマニュアル", bySource("drive_pdf")],
  ];
  const headRow = wsSummary.addRow(["項目", "値"]);
  headRow.font = { bold: true };
  for (const [k, v] of summaryRows) wsSummary.addRow([k, v]);
  wsSummary.addRow([]);
  wsSummary.addRow([
    "このExcelはHLS-projectで稼働中のナレッジベースDB(SQLite/Drizzle)のスナップショットです。" +
      "npm run db:seed / db:import-pdfs を実行すると自動的に再生成されます(package.jsonのpostフックで連動)。",
  ]);
  const genNoteRow = wsSummary.lastRow!;
  genNoteRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF808080" } };
  genNoteRow.getCell(1).alignment = WRAP;
  wsSummary.mergeCells(genNoteRow.number, 1, genNoteRow.number, 2);

  // --- OTAマスタ ---
  const wsOta = wb.addWorksheet("OTAマスタ");
  wsOta.columns = [{ width: 6 }, { width: 18 }, { width: 16 }, { width: 34 }, { width: 34 }, { width: 30 }];
  headerRow(wsOta, ["ID", "名称", "区分", "管理画面URL", "公式ヘルプURL", "備考"]);
  for (const o of otas) {
    const row = wsOta.addRow([o.id, o.name, o.category, o.adminUrl ?? "", o.helpUrl ?? "", o.notes ?? ""]);
    row.eachCell((cell, colNumber) => {
      cell.border = BORDER;
      cell.alignment = WRAP;
      cell.fill = CATEGORY_FILL[o.category] ?? CATEGORY_FILL["その他"];
      if ((colNumber === 4 || colNumber === 5) && cell.value) {
        cell.font = LINK_FONT;
        cell.value = { text: String(cell.value), hyperlink: String(cell.value) };
      }
    });
  }

  // --- 施設マスタ ---
  const wsFacility = wb.addWorksheet("施設マスタ");
  wsFacility.columns = [{ width: 6 }, { width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 50 }];
  headerRow(wsFacility, ["ID", "施設名", "チーム", "担当ディレクター", "AD", "備考"]);
  for (const f of facilities) {
    const row = wsFacility.addRow([f.id, f.name, f.teamName ?? "", f.directorName ?? "", f.adName ?? "", f.notes ?? ""]);
    row.eachCell((cell) => {
      cell.border = BORDER;
      cell.alignment = WRAP;
    });
  }

  // --- ナレッジ一覧(索引) ---
  const wsIndex = wb.addWorksheet("ナレッジ一覧(索引)");
  wsIndex.columns = [
    { width: 6 }, { width: 40 }, { width: 12 }, { width: 22 }, { width: 16 },
    { width: 16 }, { width: 24 }, { width: 8 }, { width: 18 }, { width: 40 },
  ];
  headerRow(wsIndex, [
    "No", "タイトル", "OTA区分", "OTA/サイトコントローラー", "施設",
    "業務カテゴリ", "タグ", "本文", "出典", "リンク",
  ]);
  entries.forEach((e, i) => {
    const ota = e.otaId ? otaById.get(e.otaId) : undefined;
    const facility = e.facilityId ? facilityById.get(e.facilityId) : undefined;
    const row = wsIndex.addRow([
      i + 1,
      e.title,
      ota?.category ?? "-",
      ota?.name ?? "未分類",
      facility?.name ?? "-",
      e.category ?? "未分類",
      e.tags ?? "-",
      e.hasContent ? "あり" : "要補完",
      e.source,
      e.sourceUrl ?? "",
    ]);
    row.eachCell((cell, colNumber) => {
      cell.border = BORDER;
      cell.alignment = WRAP;
      if (colNumber === 10 && cell.value) {
        cell.font = LINK_FONT;
        cell.value = { text: String(cell.value), hyperlink: String(cell.value) };
      }
      if (colNumber === 8) {
        cell.fill = e.hasContent ? CATEGORY_FILL["海外OTA"] : CATEGORY_FILL["サイトコントローラー"];
      }
    });
  });

  // --- ナレッジ本文 ---
  const wsBody = wb.addWorksheet("ナレッジ本文");
  wsBody.columns = [{ width: 6 }, { width: 34 }, { width: 20 }, { width: 16 }, { width: 90 }, { width: 40 }];
  headerRow(wsBody, ["No", "タイトル", "OTA/サイトコントローラー", "業務カテゴリ", "本文", "出典URL"]);
  const bodyEntries = entries.filter((e) => e.hasContent);
  bodyEntries.forEach((e, i) => {
    const ota = e.otaId ? otaById.get(e.otaId) : undefined;
    let body = e.body ?? "";
    const original = body;
    if (body.length > MAX_CELL_CHARS) {
      body = `${body.slice(0, MAX_CELL_CHARS)}\n\n...(以下省略、全文は出典URL参照。原文${original.length}文字)`;
    }
    const row = wsBody.addRow([i + 1, e.title, ota?.name ?? "未分類", e.category ?? "未分類", body, e.sourceUrl ?? ""]);
    row.eachCell((cell, colNumber) => {
      cell.border = BORDER;
      cell.alignment = WRAP;
      if (colNumber === 6 && cell.value) {
        cell.font = LINK_FONT;
        cell.value = { text: String(cell.value), hyperlink: String(cell.value) };
      }
    });
    row.height = Math.min(400, Math.max(20, Math.ceil(body.length / 15)));
  });
  wsBody.addRow([]);
  wsBody.addRow([
    `※本文が確認できた${bodyEntries.length}件のみ掲載(${entries.length - bodyEntries.length}件は本文未確認のため「ナレッジ一覧(索引)」シートのみに記載)。` +
      `1セル約${MAX_CELL_CHARS}文字を超えるものは省略し、出典URLに全文へのリンクを記載。`,
  ]);
  const bodyNote = wsBody.lastRow!;
  bodyNote.getCell(1).font = { italic: true, size: 9, color: { argb: "FF808080" } };
  bodyNote.getCell(1).alignment = WRAP;
  wsBody.mergeCells(bodyNote.number, 1, bodyNote.number, 6);

  await wb.xlsx.writeFile(OUT_PATH);
  console.log(`saved: ${OUT_PATH}`);
  console.log(`entries: ${entries.length} (本文あり ${withContent})`);

  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
