import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useResidents, useCreateResident, useUpdateResident, useDeleteResident } from "../lib/queries";
import {
  EmptyState,
  ErrorState,
  LoadingList,
} from "../components/states/AsyncStates";

export default function SettingsRoute() {
  const residents = useResidents();
  const createResident = useCreateResident();
  const updateResident = useUpdateResident();
  const deleteResident = useDeleteResident();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">入居者一覧</h2>
      <Card>
        <CardHeader>
          <CardTitle>入居者一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Add new resident */}
          <form
            className="mb-4 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = newName.trim();
              if (!name) return;
              try {
                await createResident.mutateAsync({ full_name: name });
                setNewName("");
              } catch (err) {
                // eslint-disable-next-line no-alert
                alert(`追加に失敗しました: ${String(err)}`);
              }
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="氏名を入力"
              disabled={createResident.isPending}
            />
            <Button type="submit" disabled={createResident.isPending || !newName.trim()}>
              追加
            </Button>
          </form>

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
                    <th className="py-2 w-[140px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(residents.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {r.id}
                      </td>
                      <td className="py-2">
                        {editingId === r.id ? (
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          r.full_name
                        )}
                      </td>
                      <td className="py-2">
                        {editingId === r.id ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={async () => {
                                const name = editingName.trim();
                                if (!name) return;
                                try {
                                  await updateResident.mutateAsync({ id: r.id, full_name: name });
                                  setEditingId(null);
                                  setEditingName("");
                                } catch (err) {
                                  // eslint-disable-next-line no-alert
                                  alert(`更新に失敗しました: ${String(err)}`);
                                }
                              }}
                              disabled={updateResident.isPending || !editingName.trim()}
                            >
                              保存
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingId(null);
                                setEditingName("");
                              }}
                              disabled={updateResident.isPending}
                            >
                              キャンセル
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingId(r.id);
                                setEditingName(r.full_name);
                              }}
                            >
                              編集
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={async () => {
                                const ok = window.confirm(`本当に削除しますか？\n${r.full_name}`);
                                if (!ok) return;
                                try {
                                  await deleteResident.mutateAsync(r.id);
                                } catch (err) {
                                  // eslint-disable-next-line no-alert
                                  alert(`削除に失敗しました: ${String(err)}`);
                                }
                              }}
                              disabled={deleteResident.isPending}
                            >
                              削除
                            </Button>
                          </div>
                        )}
                      </td>
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
