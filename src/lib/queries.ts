import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { CareEvent, DateRange, HeatCell, Resident, SourceDoc } from "../types";

// Keys
const qk = {
  residents: ["residents"] as const,
  totals: (range: DateRange) => ["totals", range] as const,
  heatmap: (range: DateRange) => ["heatmap", range] as const,
  review: (sourceDocId: string) => ["review", sourceDocId] as const,
  sourceDoc: (id: string) => ["sourceDoc", id] as const,
};

/** Fetch residents list */
export function useResidents() {
  return useQuery({
    queryKey: qk.residents,
    queryFn: async (): Promise<Resident[]> => {
      const { data, error } = await supabase
        .from("residents")
        .select("id, full_name")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Resident[];
    },
  });
}

/** Totals grouped by resident and category */
export function useTotals(range: DateRange) {
  return useQuery({
    queryKey: qk.totals(range),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("care_totals", {
        from_date: range.from,
        to_date: range.to,
      });
      // Fallback to SQL if RPC not defined
      if (error || !Array.isArray(data)) {
        const { data: rows, error: err2 } = await supabase
          .from("care_events")
          .select("resident_name, category, count")
          .gte("event_date", range.from)
          .lte("event_date", range.to);
        if (err2) throw err2;
        const map = new Map<
          string,
          {
            resident_name: string;
            category: CareEvent["category"];
            total: number;
          }
        >();
        for (const r of rows ?? []) {
          const key = `${r.resident_name}:${r.category}`;
          const prev = map.get(key) ?? {
            resident_name: r.resident_name,
            category: r.category,
            total: 0,
          };
          prev.total += (r as any).count ?? 0;
          map.set(key, prev);
        }
        return Array.from(map.values());
      }
      return data;
    },
  });
}

/** Heatmap aggregated by hour */
export function useHeatmap(range: DateRange) {
  return useQuery({
    queryKey: qk.heatmap(range),
    queryFn: async (): Promise<HeatCell[]> => {
      const { data, error } = await supabase
        .from("care_events")
        .select("resident_name, category, hour, count, guided, incontinence")
        .gte("event_date", range.from)
        .lte("event_date", range.to);
      if (error) throw error;
      const map = new Map<string, HeatCell>();
      for (const r of data ?? []) {
        const key = `${(r as any).resident_name}:${(r as any).category}:${
          (r as any).hour
        }`;
        const prev = map.get(key) ?? {
          resident_name: (r as any).resident_name,
          category: (r as any).category,
          hour: (r as any).hour,
          total: 0,
          any_guided: false,
          any_incont: false,
        };
        prev.total += (r as any).count ?? 0;
        prev.any_guided = prev.any_guided || !!(r as any).guided;
        prev.any_incont = prev.any_incont || !!(r as any).incontinence;
        map.set(key, prev);
      }
      return Array.from(map.values());
    },
  });
}

/** Fetch rows to review for a source doc */
export function useReviewRows(sourceDocId: string) {
  return useQuery({
    queryKey: qk.review(sourceDocId),
    queryFn: async (): Promise<CareEvent[]> => {
      const { data, error } = await supabase
        .from("care_events")
        .select("*")
        .eq("source_doc_id", sourceDocId);
      if (error) throw error;
      return (data ?? []) as CareEvent[];
    },
    enabled: !!sourceDocId,
  });
}

/** Fetch single source doc and derive a URL for preview */
export function useSourceDoc(id: string) {
  return useQuery({
    queryKey: qk.sourceDoc(id),
    enabled: !!id,
    queryFn: async (): Promise<{ doc: SourceDoc; url: string | null }> => {
      const { data, error } = await supabase
        .from("source_docs")
        .select("id, storage_path")
        .eq("id", id)
        .single();
      if (error) throw error;
      const doc = data as SourceDoc;
      if (!doc?.storage_path) return { doc, url: null };
      const [bucket, ...rest] = doc.storage_path.split("/");
      const path = rest.join("/");
      // Prefer a signed URL; fall back to public URL if bucket is public
      try {
        const { data: signed, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 60);
        if (!signErr) return { doc, url: signed?.signedUrl ?? null };
      } catch (_) {
        // ignore
      }
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      return { doc, url: pub?.publicUrl ?? null };
    },
  });
}

/** Upsert care_events diff */
export function useUpsertCareEvents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: CareEvent[]): Promise<void> => {
      if (!rows.length) return;
      const { error } = await supabase.from("care_events").upsert(rows, {
        onConflict: "source_doc_id,resident_name,event_date,hour,category",
      });
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      const sourceDocId = variables[0]?.source_doc_id;
      if (sourceDocId)
        await qc.invalidateQueries({ queryKey: qk.review(sourceDocId) });
    },
  });
}

/** Call Edge Function: ingest (provider switchable) */
export function useIngest() {
  return useMutation({
    mutationFn: async (payload: {
      storagePath: string;
      sourceDocId?: string;
      provider: "vision" | "gpt";
      model?: "gpt-5-mini" | "gpt-5" | "gpt-5-nano" | "gpt-4o" | "gpt-4o-mini";
    }) => {
      const fn = payload.provider === "gpt" ? "ingest-gpt" : "ingest-ocr";
      const { data, error } = await supabase.functions.invoke(fn, {
        body: {
          storagePath: payload.storagePath,
          sourceDocId: payload.sourceDocId,
          model: payload.model,
        },
      });
      if (error) throw error;
      return data as { ok: boolean; sourceDocId?: string; inserted?: number };
    },
  });
}

/** Backward-compatible: Vision only */
export function useIngestOcr() {
  return useMutation({
    mutationFn: async (payload: {
      storagePath: string;
      sourceDocId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("ingest-ocr", {
        body: payload,
      });
      if (error) throw error;
      return data as { ok: boolean; sourceDocId?: string };
    },
  });
}

/** Call Edge Function: parse-structure */
export function useParseStructure() {
  return useMutation({
    mutationFn: async (payload: {
      sourceDocId: string;
      model?: "gpt-5-mini" | "gpt-5" | "gpt-5-nano" | "gpt-4o" | "gpt-4o-mini";
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "parse-structure",
        {
          body: payload,
        }
      );
      if (error) throw error;
      return data as { ok: boolean; inserted?: number };
    },
  });
}

/** Delete a single care_event by composite key */
export function useDeleteCareEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: {
      source_doc_id: string;
      resident_name: string;
      event_date: string;
      hour: number;
      category: CareEvent["category"];
    }): Promise<void> => {
      const { error } = await supabase
        .from("care_events")
        .delete()
        .eq("source_doc_id", key.source_doc_id)
        .eq("resident_name", key.resident_name)
        .eq("event_date", key.event_date)
        .eq("hour", key.hour)
        .eq("category", key.category);
      if (error) throw error;
    },
    onSuccess: async (_d, variables) => {
      await qc.invalidateQueries({ queryKey: qk.review(variables.source_doc_id) });
    },
  });
}
