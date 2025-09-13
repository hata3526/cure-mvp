import { useMemo, useState } from "react";
import { BatchUpload } from "../components/BatchUpload";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { ErrorState, LoadingList } from "../components/states/AsyncStates";
import { EventGrid } from "../components/EventGrid";
import { useReviewRows, useUpsertCareEvents } from "../lib/queries";

export default function ImportRoute() {
  const [selectedId, setSelectedId] = useState<string>("");
  const review = useReviewRows(selectedId);
  const upsert = useUpsertCareEvents();
  const rows = useMemo(() => review.data ?? [], [review.data]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">PDF取り込み</h2>

      <Card>
        <CardHeader>
          <CardTitle>PDFをまとめて取り込み</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchUpload onSelectSourceDoc={(id) => setSelectedId(id)} />
        </CardContent>
      </Card>

      {selectedId && (
        <Card>
          <CardHeader>
            <CardTitle>取り込みデータの確認</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">sourceDocId: {selectedId}</div>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

