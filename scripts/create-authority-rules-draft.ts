/**
 * フェーズE1「権限委譲ルール」のたたき台をプロジェクト資料シートに追加する。
 * 2026-08-11のTFO実測レポート(「公開可否・承認」確認だけ日本側の4.9倍)を受けた提案で、
 * 最終的な線引きは現場(藤原大靖・田中荘太朗)との協議で確定させることを前提とした草案。
 *
 * 使い方: npx tsx scripts/create-authority-rules-draft.ts
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
const SHEET_NAME = "権限委譲ルール(案)";

const intro: (string | null)[][] = [
  ["権限委譲ルール(たたき台) — E1", null, null, null],
  [
    "目的: 2026-08-11 田中荘太朗レポートで、TFOからの「公開可否・承認」確認だけが日本側の4.9倍という" +
      "突出した偏りを示すことが判明した(他カテゴリは1.0〜2.2倍)。情報不足ではなく、作業者に" +
      "「どこまで自分で判断してよいか」の線が引かれていないことが原因と分析されている。" +
      "本シートは業務カテゴリごとに線引きの草案を示すもので、開発は不要。",
    null,
    null,
    null,
  ],
  [
    "位置づけ: これはたたき台であり、最終決定ではない。特に「要確認」列は、過去の損害事例" +
      "(東横インで数千万円規模)を踏まえて安全側に倒して設定している。実際の運用ルールは" +
      "藤原大靖・田中荘太朗と現場で協議のうえ確定させること。",
    null,
    null,
    null,
  ],
  [null, null, null, null],
];

const header = ["業務カテゴリ", "無条件で進めてよい(作業者の自己判断でOK)", "要確認・エスカレーション必須", "判断根拠・備考"];

const rows: string[][] = [
  [
    "画像の加工・差し替え",
    "サイズ調整・トリミングなど軽微な加工、既存画像と同内容の差し替え",
    "施設から新規に預かった画像の初掲載、告知用画像など内容自体の妥当性判断を要するもの",
    "画像加工そのものは可逆的でリスクが低い。ただし「何を載せるか」の判断は残す",
  ],
  [
    "プラン・部屋の複製・軽微な修正",
    "既存プランの複製による新規プラン作成、依頼書に明記された期間・在庫数の更新",
    "新規プランの価格設定、キャンセルポリシーの変更",
    "数値の機械的な複製・更新は誤りが少ない。価格・キャンセル条件は収益・クレームに直結するため要確認",
  ],
  [
    "料金紐づけ・在庫調整",
    "依頼書に明記された金額・在庫数をそのまま反映する作業",
    "依頼書に金額が明記されていない、または依頼内容と現行設定に矛盾がある場合",
    "「対象OTA不明」と同様、依頼が不完全な場合の扱いが最大の課題。不明な場合は必ず確認する運用に統一",
  ],
  [
    "公開可否・掲載【最重要】",
    "依頼書に公開条件(即時公開/◯月◯日公開等)が明記されている場合は、その通りに実行してよい",
    "公開条件が依頼書に明記されていない、施設の意向確認が必要な告知文言、掲載後の取り消しが困難なもの",
    "実測で日本側の4.9倍の確認が発生している最大のボトルネック。「明記されていれば進めてよい」を" +
      "原則にするだけで大半のケースは確認不要にできる可能性がある",
  ],
  [
    "対象OTA・対象サイトの特定",
    "依頼書に対象OTAが明記されている場合はその通りに実行",
    "対象OTAが依頼書に明記されていない、「全OTA」か一部かが曖昧な場合",
    "TFO質問の21.9%を占める最大カテゴリ。フェーズE2(HLS依頼画面への必須項目追加)と対になる運用ルール",
  ],
  [
    "キャンセル・予約変更対応",
    "依頼書・マニュアルに定められた通常フローに沿った対応",
    "イレギュラーなキャンセル、返金が発生するもの、クレームに発展する可能性があるもの",
    "金銭・顧客対応に直結するため慎重な扱いが必要",
  ],
  [
    "クーポン・プロモーション設定",
    "既存プロモーションの期間延長・在庫追加など、内容を変えない更新",
    "新規プロモーションの割引率・条件設定、複数OTA間での整合性確認が必要なもの",
    "レートパリティ等のOTA規約違反リスクがあるため新規設定は要確認",
  ],
  [
    "施設情報・注意事項テキストの掲載",
    "依頼書の文言をそのまま転記する作業",
    "依頼書にない独自の文言を追加・修正する場合",
    "文言の妥当性判断は施設対応の領域であり、作業者の裁量外とする",
  ],
];

const footer: (string | null)[][] = [
  [null, null, null, null],
  [
    "次のステップ: このたたき台を藤原大靖・田中荘太朗に共有し、業務カテゴリの過不足・線引きの妥当性を" +
      "レビューしてもらう。合意後、正式なルールとしてマニュアル化し、制作チーム(TFO)への周知方法" +
      "(Slack/HLS/研修等)を決める。効果測定は、田中荘太朗レポートと同じ手法で再集計し「公開可否・" +
      "承認」カテゴリの倍率(現状4.9倍)の変化を見ることで検証可能。",
    null,
    null,
    null,
  ],
  [
    "決定事項(2026-08-12): 「要確認」に該当するタスクのエスカレーションは、Slackボタン回答" +
      "(承認/差し戻し等)で行う方式に決定。損害リスクの高い設定変更(ダブルチェック)の実施記録は、" +
      "別ツールを増やさずHLS本体に残す方式に決定。詳細は「機能一覧」シート参照。",
    null,
    null,
    null,
  ],
];

async function main() {
  const allRows = [...intro, header, ...rows, ...footer];
  await overwriteSheet(SPREADSHEET_ID, SHEET_NAME, allRows);
  await formatHeaderRow(SPREADSHEET_ID, SHEET_NAME, 4, intro.length);
  console.log(`完了: 「${SHEET_NAME}」シートを作成・更新しました`);
  console.log(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
