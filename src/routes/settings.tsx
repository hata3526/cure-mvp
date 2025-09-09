import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { useResidents } from "../lib/queries";
import {
  EmptyState,
  ErrorState,
  LoadingList,
} from "../components/states/AsyncStates";

export default function SettingsRoute() {
  const residents = useResidents();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">設定</h2>
      <Card>
        <CardHeader>
          <CardTitle>入居者一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {residents.isLoading ? (
            <LoadingList />
          ) : residents.isError ? (
            <ErrorState message={String(residents.error)} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2">氏名</th>
                  </tr>
                </thead>
                <tbody>
                  {(residents.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {r.id}
                      </td>
                      <td className="py-2">{r.full_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(residents.data ?? []).length === 0 && (
                <EmptyState title="入居者がまだ登録されていません" />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
