import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import * as schema from "../src/db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.KNOWLEDGE_DB_PATH ?? path.join(__dirname, "..", "data", "knowledge.db");
const PDF_ROOT = path.join(__dirname, "..", "data", "pdf-sources");

const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite, { schema });

/**
 * Drive「OTAマニュアル」フォルダ(楽天/一休・yahoo/じゃらんの公式PDFマニュアル、2026-08-11取得)から
 * 手動でダウンロードしたファイル。fileIdはDriveのファイルID(sourceIdの安定キーに使う)。
 */
const PDF_MANUALS: {
  file: string;
  fileId: string;
  otaName: string;
  title: string;
  category: string | null;
}[] = [
  {
    file: "楽天/startup.pdf",
    fileId: "1QR-gFF0Nke5fCN1C1ETVndn-a8Qnzrc0",
    otaName: "楽天トラベル",
    title: "楽天トラベル スタートアップマニュアル",
    category: null,
  },
  {
    file: "一休_yahoo/SalesPromotionManual.pdf",
    fileId: "1uzh9KJVCIIOzy7zkLJ6obD-ocegnASTB",
    otaName: "一休",
    title: "一休/Yahoo!トラベル セールスプロモーションマニュアル",
    category: null,
  },
  {
    file: "一休_yahoo/PhotoPost_Guide.pdf",
    fileId: "1PxInmLc0By1gXxgRv_X8hTKU5qkCgFfs",
    otaName: "一休",
    title: "一休/Yahoo!トラベル 画像投稿ガイド",
    category: "画像",
  },
  {
    file: "一休_yahoo/Manual_RoomRate.pdf",
    fileId: "1hiZ_CYenUR9F_Qob01BG7qYaapqGgYj9",
    otaName: "一休",
    title: "一休/Yahoo!トラベル 部屋料金設定マニュアル",
    category: "料金紐づけ",
  },
  {
    file: "一休_yahoo/Manual_Plan_StopSelling.pdf",
    fileId: "1pOaBtOkJP72P6FknhrttQoRtmbXUGNZw",
    otaName: "一休",
    title: "一休/Yahoo!トラベル プラン売り止め設定マニュアル",
    category: "プラン作成",
  },
  {
    file: "一休_yahoo/Manual_Plan_Guide.pdf",
    fileId: "1MYh-03YSAaK9L5n-Qx12zxjeIbtxVCgx",
    otaName: "一休",
    title: "一休/Yahoo!トラベル プラン作成ガイド",
    category: "プラン作成",
  },
  {
    file: "一休_yahoo/IrregularCXL_Offset.pdf",
    fileId: "1y6COOucDubb1Xq50sf6YnsPGrsEJwL9Y",
    otaName: "一休",
    title: "一休/Yahoo!トラベル イレギュラーキャンセル・オフセットマニュアル",
    category: null,
  },
  {
    file: "一休_yahoo/Coupon_Guide.pdf",
    fileId: "100Uzt_ndBJsSmWIMBoJZDMqIgrInURIx",
    otaName: "一休",
    title: "一休/Yahoo!トラベル クーポンガイド",
    category: null,
  },
  {
    file: "一休_yahoo/ChengeBookingManual.pdf",
    fileId: "1gBhN3VIGoH91IJY1ErgyuNAsXlXlas8O",
    otaName: "一休",
    title: "一休/Yahoo!トラベル 予約変更マニュアル",
    category: null,
  },
  {
    file: "じゃらん/unyou_book.pdf",
    fileId: "1Zr1ySVSGnOIJEX_Z867cfRU07UV4HYpi",
    otaName: "じゃらん",
    title: "じゃらん 運用ブック",
    category: null,
  },
  {
    file: "じゃらん/rule_book.pdf",
    fileId: "1wZy03mZb_1OM_fIWoY1NvwK1dWPGsd8O",
    otaName: "じゃらん",
    title: "じゃらん ルールブック",
    category: "施設ルール",
  },
  {
    file: "じゃらん/point_up_campaign_entry_manual.pdf",
    fileId: "1NOhSZ7wt4_Gw9dNs1FCueRpKrrYgeM9x",
    otaName: "じゃらん",
    title: "じゃらん ポイントアップキャンペーン エントリーマニュアル",
    category: null,
  },
  {
    file: "じゃらん/nyutotax_manual.pdf",
    fileId: "1Uon7pODkNGdfXC0w0vhmu-_KwyXozEI-",
    otaName: "じゃらん",
    title: "じゃらん 入湯税設定マニュアル",
    category: null,
  },
  {
    file: "じゃらん/manual.pdf",
    fileId: "1ff1CszulBWcLPzdFEKlvEoUntHCMiUjQ",
    otaName: "じゃらん",
    title: "じゃらん 総合マニュアル",
    category: null,
  },
  {
    file: "じゃらん/hpds_exp.pdf",
    fileId: "1g8vPp_aQPboClKogN7Rz0hJShPwNqIBn",
    otaName: "じゃらん",
    title: "じゃらん ホームページダイレクト(HPDS) ご案内資料",
    category: null,
  },
  {
    file: "じゃらん/gienkinplan.pdf",
    fileId: "18qTnM_ov4XBbfalnGALW0lOXqV_uAJJV",
    otaName: "じゃらん",
    title: "じゃらん 義援金プラン設定マニュアル",
    category: "プラン作成",
  },
  {
    file: "じゃらん/child_price_manual.pdf",
    fileId: "1dgBHkDPQuteahVyrUk7_kSrI_41uY0Qh",
    otaName: "じゃらん",
    title: "じゃらん 子供料金設定マニュアル",
    category: "料金紐づけ",
  },
];

async function main() {
  const existingSourceIds = new Set(
    db.select({ sourceId: schema.knowledgeEntries.sourceId }).from(schema.knowledgeEntries).all().map((r) => r.sourceId),
  );

  let inserted = 0;
  let skipped = 0;
  for (const manual of PDF_MANUALS) {
    const sourceId = `drive_pdf:${manual.fileId}`;
    if (existingSourceIds.has(sourceId)) {
      skipped++;
      continue;
    }

    const ota = db.select().from(schema.otas).where(eq(schema.otas.name, manual.otaName)).get();
    if (!ota) {
      console.error(`  ⚠ OTAマスタに "${manual.otaName}" が見つかりません。先に db:seed を実行してください。`);
      continue;
    }

    const buf = await readFile(path.join(PDF_ROOT, manual.file));
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    const body = result.text.trim();

    db.insert(schema.knowledgeEntries)
      .values({
        title: manual.title,
        body: body || null,
        hasContent: body.length > 0,
        otaId: ota.id,
        category: manual.category,
        tags: null,
        source: "drive_pdf",
        sourceId,
        sourceUrl: `https://drive.google.com/file/d/${manual.fileId}/view`,
      })
      .run();
    inserted++;
    console.log(`  + ${manual.title} (${result.text.length}文字)`);
  }

  console.log(`\n完了: ${inserted}件を新規登録 (${skipped}件は登録済みのためスキップ)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => sqlite.close());
