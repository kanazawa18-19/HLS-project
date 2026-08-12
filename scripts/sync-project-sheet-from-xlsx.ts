/**
 * ~/Desktop/OTA運用効率化_プロジェクト資料.xlsx (タスク一覧・スケジュール・仕様書等)の内容を
 * そのままGoogle Sheetsへ反映する。xlsx自体はローカルでの編集を終了しており、
 * このスクリプトは最後に生成された内容を1回だけSheetsへ移すための橋渡し用。
 *
 * 使い方: npx tsx scripts/sync-project-sheet-from-xlsx.ts
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
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

const SPREADSHEET_ID = process.env.PROJECT_SHEET_ID ?? "14uytHFnxEi60Njt9F448_uCKaqrcNFvhsQWtt-7Gd_U";
const XLSX_PATH = process.env.PROJECT_XLSX_PATH ?? path.join(process.env.HOME ?? "", "Desktop", "OTA運用効率化_プロジェクト資料.xlsx");

function cellToValue(cell: ExcelJS.Cell): string | number | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
  if (typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" || typeof v === "string") return v;
  return String(v);
}

async function main() {
  if (!existsSync(XLSX_PATH)) {
    console.error(`ファイルが見つかりません: ${XLSX_PATH}`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  for (const ws of wb.worksheets) {
    console.log(`[同期中] ${ws.name} (${ws.rowCount}行 x ${ws.columnCount}列)`);
    const rows: (string | number | null)[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rowValues: (string | number | null)[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        rowValues.push(cellToValue(row.getCell(c)));
      }
      rows.push(rowValues);
    }
    await overwriteSheet(SPREADSHEET_ID, ws.name, rows);
    if (ws.columnCount > 0) {
      await formatHeaderRow(SPREADSHEET_ID, ws.name, ws.columnCount);
    }
  }

  console.log(`\n完了: ${wb.worksheets.length}シートを同期しました`);
  console.log(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
