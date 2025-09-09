// supabase/functions/parse-structure/index.ts
// Vision OCR(JSON) → GPT（構造化） → 失敗なら幾何フォールバック（0..23列を座標）
// 最後に residents テーブル（id, full_name）で名寄せ＆フィルタして care_events へ保存。

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- ENV ----
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ========= Utils =========

function extractPlainText(ocr_json: any): string {
  try {
    return (
      ocr_json?.responses?.[0]?.fullTextAnnotation?.text ??
      ocr_json?.responses?.[0]?.textAnnotations?.[0]?.description ??
      ""
    );
  } catch {
    return "";
  }
}

// "20220531" / "2022-05-31" / "2022_05_31" → "YYYY-MM-DD"
function inferDateFromPath(storagePath?: string | null): string | null {
  if (!storagePath) return null;
  const base = storagePath.split("/").pop() || "";
  const m =
    base.match(/(20\d{2})[-_\/]?([01]\d)[-_\/]?([0-3]\d)/) ||
    base.match(/(19\d{2})[-_\/]?([01]\d)[-_\/]?([0-3]\d)/);
  if (!m) return null;
  const [_, y, mm, dd] = m;
  return `${y}-${mm}-${dd}`;
}
function toDateISO(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// "2025 年 9月25日" → "2025-09-25"
function extractJPDateISOFromText(text: string): string | null {
  const m = text.match(
    /(20\d{2}|19\d{2})\s*年\s*([1-9]|1[0-2])\s*月\s*([1-9]|[12]\d|3[01])\s*日/
  );
  if (!m) return null;
  const [_, y, mm, dd] = m;
  return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

type Cat =
  | "urination"
  | "defecation"
  | "fluid"
  | "incontinence"
  | "diaper_change"
  | "note";
function mapCategoryJPtoEN(s: string): Cat | null {
  const t = s.toLowerCase();
  if (/(排尿|尿|おしっこ|pee|urination)/i.test(t)) return "urination";
  if (/(排便|便|うんち|poop|defecation)/i.test(t)) return "defecation";
  if (/(水分|飲水|摂水|fluid|water)/i.test(t)) return "fluid";
  if (/(失禁|漏れ|incontinence)/i.test(t)) return "incontinence";
  if (/(おむつ|ｵﾑﾂ|オムツ|交換|diaper)/i.test(t)) return "diaper_change";
  if (/(備考|メモ|note|観察|所見|コメント|comment)/i.test(t)) return "note";
  return null;
}

// ========= 名簿（residents: id, full_name） =========

const NAME_STOPWORDS = new Set([
  "名前",
  "氏名",
  "全て利用",
  "全員",
  "利用者",
  "合計",
  "計",
  "凡例",
  "排尿",
  "排便",
  "水分",
  "誘導",
  "失禁",
  "チェック",
  "チェック欄",
]);

function normalizeName(s: string) {
  return (s || "").replace(/[0-9\s\-\.\,\(\)\/\\\[\]{}:;・=+*#_|]/g, "").trim();
}

async function fetchResidents() {
  const { data, error } = await supabase
    .from("residents")
    .select("id, full_name");
  if (error) throw error;

  return (data || []).map((r: any) => ({
    id: r.id as string,
    display_name: r.full_name as string,
    candidate: normalizeName(r.full_name as string),
  }));
}

// ざっくり類似度
function nameSimilarity(a: string, b: string) {
  a = normalizeName(a);
  b = normalizeName(b);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return shorter / longer;
  }
  const sa = new Set(a.split(""));
  const sb = new Set(b.split(""));
  let inter = 0;
  sa.forEach((ch) => {
    if (sb.has(ch)) inter++;
  });
  return inter / Math.max(sa.size, sb.size);
}

function pickResident(
  roster: Awaited<ReturnType<typeof fetchResidents>>,
  rawName: string,
  threshold = 0.6
) {
  const n = normalizeName(rawName);
  if (!n || NAME_STOPWORDS.has(n)) return null;
  let best: { id: string; display_name: string } | null = null;
  let bestScore = 0;
  for (const r of roster) {
    const s = nameSimilarity(n, r.candidate);
    if (s > bestScore) {
      bestScore = s;
      best = { id: r.id, display_name: r.display_name };
    }
  }
  return bestScore >= threshold ? best : null;
}

// ========= LLM (structured outputs) =========

async function callModel(
  sheetHintISO: string,
  promptText: string,
  ocr_json: any
) {
  const SCHEMA = {
    type: "object",
    properties: {
      sheet: {
        type: "object",
        properties: {
          date_iso: { type: "string" },
          title: { type: ["string", "null"] },
          facility: { type: ["string", "null"] },
        },
        required: ["date_iso"],
      },
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            resident_name: { type: "string" },
            category: { type: "string" }, // urination/defecation/fluid/note...
            hour: { type: "integer", minimum: 0, maximum: 23 },
            count: { type: "integer", minimum: 1, default: 1 },
            guided: { type: "boolean", default: false }, // ✓
            incontinence: { type: "boolean", default: false }, // △
            note: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["resident_name", "category", "hour", "count"],
        },
      },
    },
    required: ["sheet", "events"],
  } as const;

  const system = [
    "あなたはGoogle VisionのOCR結果から、介護施設の『排尿・排便・水分』記録を抽出し正規化するアシスタントです。",
    "列は 0〜23 時（24列）。右端の『合計』列は events に含めないでください。",
    "セルの記号: 数字=そのまま count、✓=guided:true、△=incontinence:true。'2✓△' は count=2, guided:true, incontinence:true。",
    "カテゴリ: 排尿→urination、排便→defecation、水分→fluid。必要に応じて note を使ってください。",
    "date_iso は見出しに『YYYY 年 M 月 D 日』があればそれを優先、無ければ既定日を使ってください。",
    `既定日: ${sheetHintISO}`,
    "推測での補完は禁止。ただし読み取れた範囲で部分的な行でも出力してください。",
  ].join("\n");

  const user = [
    "次のOCR結果（平文+JSON抜粋）から、入居者ごとの『排尿・排便・水分』× 時刻(0〜23)のセルを events にしてください。",
    "表として読み取れない場合は、改行やスペースから行列を推定して、分かる部分だけ出力してください。",
    "",
    "【平文】",
    promptText,
    "",
    "【OCR JSON 抜粋】",
    JSON.stringify(ocr_json).slice(0, 8000),
  ].join("\n");

  const body = {
    model: "gpt-5",
    response_format: {
      type: "json_schema",
      json_schema: { name: "CareSheet", schema: SCHEMA },
    },
    temperature: 0.1,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());

  const content = res?.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content);
}

// ========= 幾何フォールバック（textAnnotations 座標） =========

type Token = { text: string; x: number; y: number; w: number; h: number };
const GUIDED_RE = /(?:✓|✔|ﾚ|レ|√|v|V)/;
const INCONT_RE = /(?:△|Δ|\^)/;

function tokensFromTextAnnotations(ocr_json: any): Token[] {
  const arr: Token[] = [];
  const anns = ocr_json?.responses?.[0]?.textAnnotations || [];
  for (let i = 1; i < anns.length; i++) {
    // [0] は全文
    const a = anns[i];
    const v = a?.boundingPoly?.vertices || [];
    if (!a?.description || v.length < 2) continue;
    const x = v[0]?.x ?? 0;
    const y = v[0]?.y ?? 0;
    const w = Math.abs((v[1]?.x ?? x) - x);
    const h = Math.abs((v[3]?.y ?? y) - y);
    arr.push({ text: String(a.description), x, y, w, h });
  }
  return arr.sort((a, b) => a.y - b.y || a.x - b.x);
}
function detectHourColumns(tokens: Token[]): number[] | null {
  const cand = tokens.filter(
    (t) => /^\d{1,2}$/.test(t.text) && Number(t.text) <= 23
  );
  if (!cand.length) return null;
  const ys = cand.map((c) => c.y).sort((a, b) => a - b);
  const yCut = ys[Math.min(ys.length - 1, 12)];
  const band = cand.filter((c) => c.y <= yCut + 8);
  const uniq: { hour: number; x: number }[] = [];
  band
    .sort((a, b) => a.x - b.x)
    .forEach((c) => {
      const x = c.x;
      if (uniq.length && Math.abs(uniq[uniq.length - 1].x - x) < 20) return;
      uniq.push({ hour: parseInt(c.text, 10), x });
    });
  if (uniq.length < 12) return null;
  return uniq.map((u) => u.x); // index が hour
}
function detectCategoryFromLine(line: string): Cat | undefined {
  const t = line.replace(/\s/g, "");
  if (/排尿/.test(t)) return "urination";
  if (/排便/.test(t)) return "defecation";
  if (/(水分|飲水|摂水)/.test(t)) return "fluid";
  return mapCategoryJPtoEN(t) ?? undefined;
}
function detectCategoryRows(tokens: Token[]): { y: number; cat: Cat }[] {
  const rows: { y: number; cat: Cat }[] = [];
  for (const t of tokens) {
    const cat = detectCategoryFromLine(t.text);
    if (cat === "urination" || cat === "defecation" || cat === "fluid") {
      rows.push({ y: t.y, cat });
    }
  }
  rows.sort((a, b) => a.y - b.y);
  const merged: { y: number; cat: Cat }[] = [];
  for (const r of rows) {
    if (!merged.length || Math.abs(merged[merged.length - 1].y - r.y) > 8)
      merged.push(r);
  }
  return merged;
}
function detectResidentNames(tokens: Token[]) {
  const nameTokens = tokens.filter(
    (t) => t.x < 180 && /[一-龠々ァ-ヴーA-Za-z]/.test(t.text)
  );
  nameTokens.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; name: string }[] = [];
  let curY = -999,
    curName: string[] = [];
  for (const t of nameTokens) {
    // 見出し類は除去
    let piece = normalizeName(t.text);
    if (!piece || NAME_STOPWORDS.has(piece) || /全て|凡例|合計|計/.test(piece))
      continue;
    if (Math.abs(t.y - curY) <= 8) {
      curName.push(piece);
    } else {
      if (curName.length) rows.push({ y: curY, name: curName.join("") });
      curY = t.y;
      curName = [piece];
    }
  }
  if (curName.length) rows.push({ y: curY, name: curName.join("") });
  return rows;
}
function parseCellMark(text: string) {
  const guided = GUIDED_RE.test(text);
  const incont = INCONT_RE.test(text);
  const m = text.match(/([1-9]\d*)/);
  const count = m ? Math.max(1, parseInt(m[1], 10)) : guided || incont ? 1 : 0;
  return { count, guided, incont };
}
function geometryFallback(
  ocr_json: any,
  fallbackDateISO: string,
  roster: Awaited<ReturnType<typeof fetchResidents>>
) {
  const tokens = tokensFromTextAnnotations(ocr_json);
  if (!tokens.length)
    return { sheet: { date_iso: fallbackDateISO }, events: [] as any[] };

  const hourXs = detectHourColumns(tokens);
  if (!hourXs || hourXs.length < 12)
    return { sheet: { date_iso: fallbackDateISO }, events: [] };

  const cats = detectCategoryRows(tokens);
  const names = detectResidentNames(tokens);
  const nearest = (y: number, rows: { y: number }[]) => {
    let best = rows[0],
      d = Math.abs(y - rows[0].y);
    for (const r of rows) {
      const dd = Math.abs(y - r.y);
      if (dd < d) {
        d = dd;
        best = r;
      }
    }
    return best;
  };

  const events: any[] = [];
  const cellToks = tokens.filter((t) => /[0-9✓✔ﾚレ√vV△Δ^]/.test(t.text));
  for (const t of cellToks) {
    // 最近傍 hour
    let bestHour = 0,
      bestDx = Math.abs(t.x - hourXs[0]);
    for (let h = 1; h < hourXs.length; h++) {
      const dx = Math.abs(t.x - hourXs[h]);
      if (dx < bestDx) {
        bestDx = dx;
        bestHour = h;
      }
    }
    if (bestHour < 0 || bestHour > 23) continue;
    if (!cats.length || !names.length) continue;

    const catRow = nearest(t.y, cats);
    const nameRow = nearest(t.y, names);
    const { count, guided, incont } = parseCellMark(t.text);
    if (count <= 0 && !guided && !incont) continue;

    // 名簿照合
    const matched = pickResident(roster, nameRow.name);
    if (!matched) continue;

    events.push({
      resident_name: matched.display_name,
      category: catRow.cat,
      hour: bestHour,
      count,
      guided,
      incontinence: incont,
      note: null,
      confidence: 0.65,
    });
    if (events.length >= 1024) break;
  }

  return { sheet: { date_iso: fallbackDateISO }, events };
}

// ========= HTTP Handler =========

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  const allowed = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    Deno.env.get("APP_ORIGIN") ?? "",
  ]);
  const allowOrigin = allowed.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  } as const;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { sourceDocId } = await req.json();
    if (!sourceDocId)
      return new Response("sourceDocId required", {
        status: 400,
        headers: corsHeaders,
      });

    // 名簿取得
    const roster = await fetchResidents();

    // 1) OCR取得
    const { data: doc, error: getErr } = await supabase
      .from("source_docs")
      .select("ocr_json, storage_path, created_at")
      .eq("id", sourceDocId)
      .single();
    if (getErr) throw getErr;

    const text = extractPlainText(doc?.ocr_json);

    // 和文日付 > ファイル名 > 作成日
    const jpDate = extractJPDateISOFromText(text);
    const inferred = inferDateFromPath(doc?.storage_path);
    const sheetHintISO =
      jpDate ?? inferred ?? toDateISO(new Date(doc?.created_at ?? Date.now()));

    // 2) LLM抽出（2回; 後で名簿フィルタ）
    let parsed = await callModel(sheetHintISO, text, doc?.ocr_json ?? {});
    let events: any[] = Array.isArray(parsed?.events) ? parsed.events : [];
    if (!events.length) {
      const extra =
        text +
        "\n\n※必ず events に1件以上出力してください（分かる範囲で構いません）。";
      parsed = await callModel(sheetHintISO, extra, doc?.ocr_json ?? {});
      events = Array.isArray(parsed?.events) ? parsed.events : [];
    }

    // 3) LLMで0件 → 幾何フォールバック（名簿フィルタ付き）
    if (!events.length) {
      parsed = geometryFallback(doc?.ocr_json ?? {}, sheetHintISO, roster);
      events = parsed.events;
    }

    // 4) 名簿に名寄せ＆フィルタ（LLM経路でも実施）
    const filtered = [];
    for (const e of events || []) {
      const matched = pickResident(roster, e?.resident_name || "");
      if (!matched) continue;
      filtered.push({ ...e, resident_name: matched.display_name });
    }

    // 5) 行整形 → 保存
    const dateISO: string =
      parsed?.sheet?.date_iso &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.sheet.date_iso)
        ? parsed.sheet.date_iso
        : sheetHintISO;

    const rows = filtered
      .map((e: any) => {
        const cat =
          mapCategoryJPtoEN(e?.category || "") ||
          (e?.category as Cat) ||
          "note";
        const hour = Number.isInteger(e?.hour) ? e.hour : null;
        const count =
          typeof e?.count === "number" && e.count >= 1 ? e.count : 1;
        return {
          source_doc_id: sourceDocId,
          resident_name: e?.resident_name, // 名簿の正式名
          event_date: dateISO,
          hour, // 0..23
          category: cat, // urination/defecation/fluid/note...
          value: e?.note ?? null,
          count,
          guided: !!e?.guided,
          incontinence: !!e?.incontinence,
          confidence: typeof e?.confidence === "number" ? e.confidence : 0.7,
          needs_review: (e?.confidence ?? 1) < 0.75,
        };
      })
      .filter(
        (r) =>
          Number.isInteger(r.hour) &&
          r.event_date &&
          r.resident_name &&
          r.category
      );

    if (!rows.length) {
      return new Response(
        JSON.stringify({
          ok: true,
          inserted: 0,
          hint: "no rows after roster-filter",
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { error: insErr } = await supabase.from("care_events").insert(rows);
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
