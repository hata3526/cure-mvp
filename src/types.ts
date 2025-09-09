/**
 * Domain types for care events and analytics.
 * These types are used across queries and UI components.
 */
export type CareEvent = {
  source_doc_id: string;
  resident_name: string;
  event_date: string; // YYYY-MM-DD
  hour: number; // 0..23
  category: "urination" | "defecation" | "fluid";
  count: number;
  guided: boolean;
  incontinence: boolean;
  value: string | null;
};

export type HeatCell = {
  resident_name: string;
  category: CareEvent["category"];
  hour: number;
  total: number;
  any_guided: boolean;
  any_incont: boolean;
};

export type DateRange = { from: string; to: string };

export type Resident = { id: string; full_name: string };
