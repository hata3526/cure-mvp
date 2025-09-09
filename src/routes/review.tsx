import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { EventGrid } from "../components/EventGrid";
import { useReviewRows, useUpsertCareEvents } from "../lib/queries";
import { UploadOcr } from "../components/UploadOcr";
import { ErrorState, LoadingList } from "../components/states/AsyncStates";
import { Button } from "../components/ui/button";

export default function ReviewRoute() {
  const params = useParams<{ sourceDocId: string }>();
  const navigate = useNavigate();
  const sourceDocId =
    params.sourceDocId === "new" ? "" : params.sourceDocId || "";
  const review = useReviewRows(sourceDocId);
  const upsert = useUpsertCareEvents();

  useEffect(() => {
    if (params.sourceDocId === "new") {
      // No-op, waiting for OCR ingest
    }
  }, [params.sourceDocId]);

  const rows = useMemo(() => review.data ?? [], [review.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">レビュー</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>OCR → 解析 → レビュー</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <UploadOcr
            currentSourceDocId={sourceDocId}
            onParsed={(id) => {
              navigate(`/review/${id}`);
            }}
          />
        </CardContent>
      </Card>

      {sourceDocId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>編集グリッド</CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">
                  sourceDocId: {sourceDocId}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => review.refetch()}
                  disabled={review.isLoading}
                >
                  {review.isLoading ? "再取得中..." : "DBから再取得"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {review.isLoading ? (
              <LoadingList />
            ) : review.isError ? (
              <ErrorState message={String(review.error)} />
            ) : (
              <EventGrid
                rows={rows}
                onSave={async (changed) => {
                  try {
                    await upsert.mutateAsync(changed);
                  } catch (err) {
                    console.error(err);
                  }
                }}
              />
            )}
            {upsert.isError && <ErrorState message={String(upsert.error)} />}
            {upsert.isSuccess && (
              <div className="text-sm text-muted-foreground mt-2">
                保存しました
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
