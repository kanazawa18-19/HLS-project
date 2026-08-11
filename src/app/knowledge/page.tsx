import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { knowledgeEntries, otas } from "@/db/schema";
import { buildKnowledgeConditions, combineConditions } from "@/db/knowledge-queries";

interface KnowledgePageProps {
  searchParams: Promise<{ otaId?: string; category?: string; q?: string; hasContent?: string }>;
}

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const params = await searchParams;
  const db = getDb();

  const otaList = db.select().from(otas).orderBy(otas.category, otas.name).all();
  const categoryRows = db
    .selectDistinct({ category: knowledgeEntries.category })
    .from(knowledgeEntries)
    .all();
  const categoryList = categoryRows
    .map((r) => r.category)
    .filter((c): c is string => Boolean(c))
    .sort();

  const conditions = buildKnowledgeConditions(params);

  const entries = db
    .select()
    .from(knowledgeEntries)
    .where(combineConditions(conditions))
    .orderBy(desc(knowledgeEntries.hasContent), knowledgeEntries.title)
    .limit(200)
    .all();

  const totalCount = db.select().from(knowledgeEntries).all().length;
  const withContentCount = db
    .select()
    .from(knowledgeEntries)
    .where(combineConditions(buildKnowledgeConditions({ hasContent: "true" })))
    .all().length;
  const unclassifiedOtaCount = db
    .select()
    .from(knowledgeEntries)
    .where(combineConditions(buildKnowledgeConditions({ otaId: "none" })))
    .all().length;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">ナレッジベース</h1>
        <p className="mt-1 text-sm text-gray-500">
          OTA運用代行 業務効率化プロジェクト フェーズA - {totalCount}件(本文あり {withContentCount}件 / OTA未分類{" "}
          {unclassifiedOtaCount}件)
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 p-4" method="GET">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500" htmlFor="q">
            検索
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="タイトル・本文を検索"
            className="w-56 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500" htmlFor="otaId">
            OTA/サイトコントローラー
          </label>
          <select
            id="otaId"
            name="otaId"
            defaultValue={params.otaId ?? ""}
            className="w-56 rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">すべて</option>
            <option value="none">未分類のみ(要棚卸し)</option>
            {otaList.map((o) => (
              <option key={o.id} value={o.id}>
                [{o.category}] {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500" htmlFor="category">
            業務カテゴリ
          </label>
          <select
            id="category"
            name="category"
            defaultValue={params.category ?? ""}
            className="w-44 rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">すべて</option>
            <option value="none">未分類のみ(要棚卸し)</option>
            {categoryList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500" htmlFor="hasContent">
            本文
          </label>
          <select
            id="hasContent"
            name="hasContent"
            defaultValue={params.hasContent ?? ""}
            className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">すべて</option>
            <option value="true">ありのみ</option>
            <option value="false">なしのみ(要補完)</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          絞り込む
        </button>
        <a href="/knowledge" className="text-sm text-gray-500 underline">
          リセット
        </a>
      </form>

      <div className="text-sm text-gray-500">{entries.length}件を表示(最大200件)</div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">タイトル</th>
              <th className="px-3 py-2">OTA</th>
              <th className="px-3 py-2">カテゴリ</th>
              <th className="px-3 py-2">本文</th>
              <th className="px-3 py-2">出典</th>
              <th className="px-3 py-2">リンク</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const ota = otaList.find((o) => o.id === entry.otaId);
              return (
                <tr key={entry.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 font-medium">
                    {entry.title}
                    {entry.body && (
                      <p className="mt-1 line-clamp-2 max-w-md text-xs font-normal text-gray-500">{entry.body}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ota?.name ?? <span className="text-yellow-700">未分類</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {entry.category ?? <span className="text-yellow-700">未分類</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {entry.hasContent ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">あり</span>
                    ) : (
                      <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">要補完</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{entry.source}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {entry.sourceUrl && (
                      <a
                        href={entry.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        出典を開く
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
