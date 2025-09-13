import { useParams, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { EventGrid } from "../components/EventGrid";
import {
  useReviewRows,
  useUpsertCareEvents,
  useDeleteCareEvent,
  useSourceDoc,
} from "../lib/queries";
import { ErrorState, LoadingList } from "../components/states/AsyncStates";
import { Button } from "../components/ui/button";
import { SourceDocViewer } from "../components/SourceDocViewer";

export default function ReviewSplitRoute() {
  const params = useParams<{ sourceDocId: string }>();
  const navigate = useNavigate();
  const sourceDocId = params.sourceDocId || "";
  const review = useReviewRows(sourceDocId);
  const upsert = useUpsertCareEvents();
  const del = useDeleteCareEvent();
  const doc = useSourceDoc(sourceDocId);

  const rows = useMemo(() => review.data ?? [], [review.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">レビュー（分割ビュー）</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/review/${sourceDocId}`)}>
            通常ビューへ戻る
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              review.refetch();
              doc.refetch?.();
            }}
            disabled={review.isLoading}
          >
            {review.isLoading ? "再取得中..." : "DB から再取得"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>編集 + 原本プレビュー</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">sourceDocId: {sourceDocId}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="min-h-[520px] lg:max-h-[75vh] overflow-auto">
              {review.isLoading ? (
                <LoadingList />
              ) : review.isError ? (
                <ErrorState message={String(review.error)} />
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    メモ: 値を 0 にすると既存の記録は削除されます。
                  </p>
                  <EventGrid
                    rows={rows}
                    onSave={async (changed) => {
                      try {
                        const keyOf = (r: any) => `${r.resident_name}:${r.category}:${r.event_date}:${r.hour}`;
                        const existing = new Set(rows.map(keyOf));
                        const toDelete = changed.filter((r) => (r.count ?? 0) <= 0 && existing.has(keyOf(r)));
                        const toUpsert = changed.filter((r) => (r.count ?? 0) > 0);
                        for (const r of toDelete) {
                          await del.mutateAsync({
                            source_doc_id: r.source_doc_id,
                            resident_name: r.resident_name,
                            event_date: r.event_date,
                            hour: r.hour,
                            category: r.category,
                          });
                        }
                        if (toUpsert.length) await upsert.mutateAsync(toUpsert);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  />
                </>
              )}
              {(upsert.isError || del.isError) && (
                <ErrorState message={String(upsert.error || del.error)} />
              )}
              {(upsert.isSuccess || del.isSuccess) && (
                <div className="text-sm text-muted-foreground mt-2">変更を保存しました</div>
              )}
            </div>
            <div className="min-h-[520px] lg:max-h-[75vh] overflow-auto border rounded-md p-2">
              {doc.isLoading ? (
                <div className="text-sm text-muted-foreground p-4">原本を取得中...</div>
              ) : doc.isError ? (
                <ErrorState message={String(doc.error)} />
              ) : (
                <SourceDocViewer url={doc.data?.url ?? null} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

