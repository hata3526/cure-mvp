/// <reference path="../types.d.ts" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Ajv from "https://esm.sh/ajv@8.12.0";

// ---- ENV ----
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!; // GPT Vision 用
const OPENAI_VISION_MODEL = Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4o"; // 既定モデル（上書き可）
const ALLOWED_MODELS = new Set([
  "gpt-5-mini",
  "gpt-5",
  "gpt-5-nano",
  "gpt-4o",
  "gpt-4o-mini",
]);
const LLM_MAX_TOKENS = Number.isFinite(
  parseInt(Deno.env.get("LLM_MAX_TOKENS") ?? "")
)
  ? parseInt(Deno.env.get("LLM_MAX_TOKENS") ?? "", 10)
  : undefined;
const LLM_N = Number.isFinite(parseInt(Deno.env.get("LLM_N") ?? ""))
  ? Math.max(1, Math.min(5, parseInt(Deno.env.get("LLM_N") ?? "", 10)))
  : undefined;

// Unified temperature default (used where supported)
const LLM_TEMPERATURE = (() => {
  const s = Deno.env.get("LLM_TEMPERATURE");
  if (s === undefined || s === null || s === "") return 0.1;
  const v = parseFloat(s);
  if (!Number.isFinite(v)) return 0.1;
  return Math.min(2, Math.max(0, v));
})();

// Reproducibility controls
const LLM_TOP_P = (() => {
  const s = Deno.env.get("LLM_TOP_P");
  if (s === undefined || s === null || s === "") return 0;
  const v = parseFloat(s);
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
})();

const LLM_SEED = (() => {
  const s = Deno.env.get("LLM_SEED");
  const v = s ? parseInt(s, 10) : NaN;
  return Number.isFinite(v) ? v : undefined;
})();

// Explicit gate for multi-sampling (n>1). Default: disabled
const LLM_ENABLE_MULTI_CHOICE =
  (Deno.env.get("LLM_ENABLE_MULTI_CHOICE") ?? "false").toLowerCase() === "true";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ========= Utils =========
type Cat =
  | "urination"
  | "defecation"
  | "fluid"
  | "incontinence"
  | "diaper_change"
  | "note";

function mapCategoryJPtoEN(s: string): Cat | null {
  const t = (s || "").toLowerCase();
  if (/(排尿|尿|おしっこ|pee|urination|urinatio|urine)/i.test(t))
    return "urination";
  if (/(排便|便|うんち|poop|defecation|defeca|defec|feces|stool)/i.test(t))
    return "defecation";
  if (/(水分|飲水|摂水|fluid|water|drink|hydration)/i.test(t)) return "fluid";
  if (/(失禁|漏れ|incontinence)/i.test(t)) return "incontinence";
  if (/(おむつ|ｵﾑﾂ|オムツ|交換|diaper)/i.test(t)) return "diaper_change";
  if (/(備考|メモ|note|観察|所見|コメント|comment)/i.test(t)) return "note";
  return null;
}

function mapCategoryENtoJP(cat: Cat): string {
  switch (cat) {
    case "urination":
      return "排尿";
    case "defecation":
      return "排便";
    case "fluid":
      return "水分";
    default:
      return String(cat);
  }
}

function buildPatientsView(rows: any[], dateISO: string) {
  const map = new Map<string, { name: string; events: any[] }>();
  for (const r of rows || []) {
    const name = r?.resident_name || "";
    if (!name || !Number.isInteger(r?.hour)) continue;
    const jp = mapCategoryENtoJP(r?.category as Cat);
    const ev = { hour: r.hour, category: jp, type: r.category, count: r.count };
    const cur = map.get(name) ?? { name, events: [] as any[] };
    cur.events.push(ev);
    map.set(name, cur);
  }
  return { date_iso: dateISO, patients: Array.from(map.values()) };
}

const NAME_STOPWORDS = new Set([
  "名前",
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

// ========= GPT Vision 呼び出し =========
function extractJsonFromText(text: string): any | null {
  if (!text || typeof text !== "string") return null;
  // ```json ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch (_) {
    // 先頭の { or [ から末尾までを順次縮めて試行（簡易）
    const start = Math.min(
      ...[candidate.indexOf("{"), candidate.indexOf("[")].filter((i) => i >= 0)
    );
    if (Number.isFinite(start) && start >= 0) {
      for (let end = candidate.length; end > start + 1; end--) {
        const slice = candidate.slice(start, end);
        try {
          return JSON.parse(slice);
        } catch (_) {
          // continue
        }
      }
    }
  }
  return null;
}

// Try to extract a plain string text from a Responses API result
function extractTextFromResponses(resp: any): string | null {
  try {
    if (!resp) return null;
    if (typeof resp.output_text === "string" && resp.output_text.length > 0) {
      return resp.output_text;
    }
    const texts: string[] = [];
    const collect = (n: any) => {
      if (!n) return;
      if (typeof n === "string") return; // avoid capturing ids/keys blindly
      if (typeof n?.text === "string") {
        texts.push(n.text);
        return;
      }
      if (Array.isArray(n)) {
        for (const it of n) collect(it);
      } else if (typeof n === "object") {
        // Responses blocks
        if (n.type === "output_text" && typeof n.text === "string") {
          texts.push(n.text);
        }
        if (n.type === "message" && Array.isArray(n.content)) {
          for (const c of n.content) collect(c);
        }
        if (Array.isArray(n.output)) collect(n.output);
        if (Array.isArray(n.content)) collect(n.content);
        // generic object walk for nested arrays/objects
        for (const k of Object.keys(n)) {
          const v = (n as any)[k];
          if (k === "id" && typeof v === "string") continue;
          if (typeof v === "string") continue;
          collect(v);
        }
      }
    };
    collect(resp);
    return texts.length ? texts.join("\n").slice(0, 32000) : null;
  } catch (_) {
    return null;
  }
}

function extractParsedFromResponses(resp: any): any | null {
  try {
    if (!resp) return null;
    if (resp.output_parsed) return resp.output_parsed;
    const scan = (n: any): any | null => {
      if (!n) return null;
      if (Array.isArray(n)) {
        for (const it of n) {
          const r = scan(it);
          if (r) return r;
        }
        return null;
      }
      if (typeof n === "object") {
        if (
          (n.type === "output_parsed" || n.type === "json_schema") &&
          n.parsed !== undefined
        ) {
          return n.parsed;
        }
        if (n.parsed && typeof n.parsed === "object") return n.parsed;
        // traverse common containers
        if (Array.isArray((n as any).output)) {
          const r = scan((n as any).output);
          if (r) return r;
        }
        if (Array.isArray((n as any).content)) {
          const r = scan((n as any).content);
          if (r) return r;
        }
        for (const k of Object.keys(n)) {
          const r = scan((n as any)[k]);
          if (r) return r;
        }
      }
      return null;
    };
    return scan(resp);
  } catch (_) {
    return null;
  }
}

async function callGptVision(
  imageUrl: string,
  sheetHintISO: string,
  overrideModel?: string | null
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
        additionalProperties: false,
      },
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            resident_name: { type: "string" },
            category: {
              type: "string",
              enum: ["urination", "defecation", "fluid"],
            },
            hour: { type: "integer", minimum: 0, maximum: 23 },
            count: { type: "integer", minimum: 1, default: 1 },
            guided: { type: "boolean", default: false },
            incontinence: { type: "boolean", default: false },
            note: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["resident_name", "category", "hour", "count"],
          additionalProperties: false,
        },
      },
    },
    required: ["sheet", "events"],
    additionalProperties: false,
  } as const;

  const roster = await fetchResidents();
  const rosterList = roster.map((r: any) => r.display_name).join(", ");
  const system = [
    "この画像には『排泄・水分チェック表（単日）』が含まれています。次のルールで表データを抽出し正規化してください。",
    "表の構造: 左端に『名前』『種類』列があり、その右に 0〜23 時（24列）が並びます。1人あたりの行は『排便』『排尿』『水分』の3行の順です。",
    "日付抽出: 見出し（右上など）に『YYYY年M月D日』があればそれを優先し、無ければ既定日を使用します。",
    `既定日: ${sheetHintISO}（見出しから抽出できない場合に使用）`,
    "記録ルール（厳格）: 排便・排尿は該当時刻セルに『1』が書かれている場合のみ記録対象（『1』以外の記号・数字・文字は無効として無視、空欄は未記録）。",
    "記録ルール（厳格）: 水分は該当時刻セルに ml の整数値のみを記録対象（単位や記号は除去し数値化。例: '200ml' → 200）。空欄は未記録。",
    "カテゴリ: 排便→defecation、排尿→urination、水分→fluid。",
    `氏名は以下の候補から選択し、候補にない氏名は出力しないでください。候補: ${rosterList}`,
    "0..23 の各時間列について、セルが空でない場合のみ events に 1 件として出力してください（空欄は出力しない）。",
    "『合計』『計』『凡例』などの見出しや右端の合計列は events に含めないでください。",
    "名前はグリッド左側の氏名欄から取得し、同じ入居者の全カテゴリ行に継承してください。",
    "返答はデータ本体の JSON のみ。説明文・コードブロック・スキーマ定義は返さないでください。",
  ].join("\n");

  const userParts = [
    {
      type: "text",
      text: "画像内の『排泄・水分チェック表（単日）』から、上記ルールに従って内容を抽出し、指定スキーマの JSON を返してください。各カテゴリ行の 0..23 の空でないセルのみを events に含め、合計や凡例は無視してください。返答は JSON のみで、説明やスキーマは不要です。",
    },
    { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
  ];

  // Force model to gpt-4o for best structured extraction stability
  const model = "gpt-4o";
  const supportsCustomTemperature = !/^gpt-5/i.test(model);
  const body: any = {
    model,
    response_format: {
      type: "json_schema",
      json_schema: { name: "CareSheet", schema: SCHEMA },
    },
    messages: [
      { role: "system", content: system },
      { role: "user", content: userParts as any },
    ],
    top_p: LLM_TOP_P,
    seed: LLM_SEED,
  };
  // Apply low temperature only when the model supports custom temperature
  if (supportsCustomTemperature) body.temperature = LLM_TEMPERATURE;
  // Do not set max_tokens at all by default (no restriction)
  // Multi-sampling gated behind explicit env toggle (independent of high-accuracy)
  if (LLM_ENABLE_MULTI_CHOICE && (LLM_N || 0) > 1) body.n = LLM_N ?? 3;

  // First attempt
  const http = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const http_status = http.status;
  let res: any;
  try {
    res = await http.json();
  } catch (_) {
    const txt = await http.text();
    res = {
      error: {
        message: "Non-JSON response",
        text_preview: txt?.slice(0, 1200),
      },
    };
  }

  // Aggregate multiple choices if present (pick the one with most events)
  const choices: any[] = Array.isArray(res?.choices) ? res.choices : [];
  let parsed: any = {};
  let parseStrategy: "direct" | "recovered" | "empty" = "empty";
  let choiceEventsCounts: number[] = [];
  if (choices.length > 1) {
    let bestIdx = -1;
    let bestScore = -1;
    const candidates: any[] = [];
    for (let i = 0; i < choices.length; i++) {
      const contentI = choices[i]?.message?.content ?? "";
      let p: any = {};
      try {
        p = contentI ? JSON.parse(contentI) : {};
      } catch (_) {
        const rec = extractJsonFromText(contentI);
        p = rec ?? {};
      }
      const ev = Array.isArray(p?.events)
        ? p.events
        : Array.isArray(p?.properties?.events)
        ? p.properties.events
        : [];
      const score = Array.isArray(ev) ? ev.length : 0;
      choiceEventsCounts.push(score);
      candidates.push(p);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    parsed = bestIdx >= 0 ? candidates[bestIdx] : {};
    parseStrategy = bestIdx >= 0 ? "direct" : "empty";
  } else {
    const content = res?.choices?.[0]?.message?.content ?? "";
    try {
      parsed = content ? JSON.parse(content) : {};
      parseStrategy = content ? "direct" : "empty";
    } catch (_) {
      const recovered = extractJsonFromText(content);
      parsed = recovered ?? {};
      parseStrategy = recovered ? "recovered" : "empty";
    }
  }

  // Validate against schema; retry once if invalid or empty
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(SCHEMA as any);
  let isValid = false;
  if (parsed && Object.keys(parsed).length > 0) {
    isValid = validate(parsed) as boolean;
  }

  // Fallback attempt with json_object if empty or invalid
  let fallback: any = null;
  if (!parsed || Object.keys(parsed).length === 0 || !isValid) {
    const fallbackBody = {
      ...body,
      response_format: { type: "json_object" as const },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            ...userParts,
            {
              type: "text",
              text: "指定スキーマに準拠した JSON のみを返してください。説明やコードブロックは不要です。",
            },
          ] as any,
        },
      ],
    };
    try {
      const http2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(fallbackBody),
      });
      const http_status2 = http2.status;
      let res2: any;
      try {
        res2 = await http2.json();
      } catch (_) {
        const txt2 = await http2.text();
        res2 = {
          error: {
            message: "Non-JSON response",
            text_preview: txt2?.slice(0, 1200),
          },
        };
      }
      const content2 = res2?.choices?.[0]?.message?.content ?? "";
      try {
        if (content2) {
          parsed = JSON.parse(content2);
          parseStrategy = "direct";
        }
      } catch (_) {
        const recovered2 = extractJsonFromText(content2);
        if (recovered2) {
          parsed = recovered2;
          parseStrategy = "recovered";
        }
      }
      try {
        isValid = parsed && validate(parsed as any);
      } catch (_) {
        isValid = false;
      }
      fallback = {
        http_status: http_status2,
        id: res2?.id,
        usage: res2?.usage,
        error: res2?.error,
        text_preview:
          typeof content2 === "string" ? content2.slice(0, 1200) : null,
      };
    } catch (e) {
      fallback = { error: String(e) };
    }
  }

  const raw = {
    id: res?.id,
    model,
    usage: res?.usage,
    error: res?.error,
    http_status,
    params: {
      temperature: body?.temperature ?? null,
      max_tokens: body?.max_tokens ?? null,
      n: body?.n ?? 1,
      enable_multi_choice: !!LLM_ENABLE_MULTI_CHOICE,
      top_p: LLM_TOP_P,
      seed: LLM_SEED ?? null,
    },
    text_preview: (() => {
      try {
        const c = choices?.[0]?.message?.content ?? "";
        return typeof c === "string" ? c.slice(0, 1200) : null;
      } catch {
        return null;
      }
    })(),
    parse_strategy: parseStrategy,
    fallback,
    num_choices: Array.isArray(res?.choices) ? res.choices.length : 0,
    choice_events: choiceEventsCounts,
  } as const;
  if (raw.error) {
    console.error("OpenAI error:", raw.error);
  }
  return { parsed, raw, isValid };
}

// GPT with PDF (Responses API + Files)
async function callGptPdf(
  pdfUrl: string,
  sheetHintISO: string,
  overrideModel?: string | null
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
        // Responses API strict mode: include every key listed in properties
        required: ["date_iso", "title", "facility"],
        additionalProperties: false,
      },
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            resident_name: { type: "string" },
            category: {
              type: "string",
              enum: ["urination", "defecation", "fluid"],
            },
            hour: { type: "integer", minimum: 0, maximum: 23 },
            count: { type: "integer", minimum: 1, default: 1 },
            guided: { type: "boolean", default: false },
            incontinence: { type: "boolean", default: false },
            note: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          // Strict mode: include all keys in properties so each field appears (null allowed)
          required: [
            "resident_name",
            "category",
            "hour",
            "count",
            "guided",
            "incontinence",
            "note",
            "confidence",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["sheet", "events"],
    additionalProperties: false,
  } as const;

  const roster = await fetchResidents();
  const rosterList = roster.map((r: any) => r.display_name).join(", ");
  const system = [
    "このPDFには『排泄・水分チェック表（単日）』が含まれています。次のルールで表データを抽出し正規化してください。",
    "表の構造: 左端に『名前』『種類』列があり、その右に 0〜23 時（24列）が並びます。1人あたりの行は『排便』『排尿』『水分』の3行の順です。",
    "日付抽出: 見出し（右上など）に『YYYY年M月D日』があればそれを優先し、無ければ既定日を使用します。",
    `既定日: ${sheetHintISO}（見出しから抽出できない場合に使用）`,
    "記録ルール（厳格）: 排便・排尿は該当時刻セルに『1』が書かれている場合のみ記録対象（『1』以外は無視、空欄は未記録）。",
    "記録ルール（厳格）: 水分は該当時刻セルに ml の整数値のみ（単位・記号は除去、例: '200ml' → 200）。空欄は未記録。",
    "カテゴリ: 排便→defecation、排尿→urination、水分→fluid。",
    `氏名は以下の候補から選択し、候補にない氏名は出力しないでください。候補: ${rosterList}`,
    "0..23 の各時間列について、セルが空でない場合のみ events に 1 件として出力（空欄は出力しない）。",
    "『合計』『計』『凡例』などの見出しや右端の合計列は events に含めないでください。",
    "名前はグリッド左側の氏名欄から取得し、同じ入居者の全カテゴリ行に継承してください。",
    "返答はデータ本体の JSON のみ。説明文・コードブロック・スキーマ定義は返さないでください。",
  ].join("\n");

  // Download the PDF bytes from storage
  const fileRes = await fetch(pdfUrl);
  if (!fileRes.ok) throw new Error(`Failed to fetch PDF: ${fileRes.status}`);
  const pdfBlob = await fileRes.blob();

  // Upload to OpenAI Files API
  const fd = new FormData();
  fd.append(
    "file",
    new File([pdfBlob], "document.pdf", { type: "application/pdf" })
  );
  // assistants purpose is accepted by Responses API for inputs
  fd.append("purpose", "assistants");

  const upload = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });
  const upload_status = upload.status;
  const uploaded = await upload.json();
  if (!upload.ok) {
    throw new Error(
      `OpenAI file upload failed: ${upload_status} ${
        uploaded?.error?.message ?? ""
      }`
    );
  }
  const file_id = uploaded?.id;
  if (!file_id) throw new Error("OpenAI file upload missing id");

  const model = "gpt-4o"; // stable for structured extraction
  const supportsCustomTemperature = !/^gpt-5/i.test(model);
  const body: any = {
    model,
    // Responses API uses text.format with required name + schema for json_schema
    text: {
      format: {
        type: "json_schema",
        name: "CareSheet",
        schema: SCHEMA,
      },
    },
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "PDFに含まれる『排泄・水分チェック表（単日）』から、上記ルールに従って抽出し、指定スキーマの JSON を返してください。",
          },
          { type: "input_file", file_id },
        ],
      },
    ],
    top_p: LLM_TOP_P,
    seed: LLM_SEED,
  };
  if (supportsCustomTemperature) body.temperature = LLM_TEMPERATURE;

  const http = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const http_status = http.status;
  let res: any = null;
  try {
    res = await http.json();
  } catch (_) {
    const txt = await http.text();
    res = {
      error: {
        message: "Non-JSON response",
        text_preview: txt?.slice(0, 1200),
      },
    };
  }

  // Parse structured output or text → JSON
  let parsed: any = {};
  let parseStrategy: "direct" | "recovered" | "empty" = "empty";
  try {
    // Prefer structured parsed output when available
    const maybeParsed = extractParsedFromResponses(res);
    if (maybeParsed && typeof maybeParsed === "object") {
      parsed = maybeParsed;
      parseStrategy = "direct";
    } else {
      const text = extractTextFromResponses(res) ?? "";
      if (text) {
        try {
          parsed = JSON.parse(text);
          parseStrategy = "direct";
        } catch (_) {
          const rec = extractJsonFromText(text);
          if (rec) {
            parsed = rec;
            parseStrategy = "recovered";
          }
        }
      }
    }
  } catch (_) {
    // ignored
  }

  // Validate against schema
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(SCHEMA as any);
  let isValid = false;
  if (parsed && Object.keys(parsed).length > 0) {
    try {
      isValid = validate(parsed) as boolean;
    } catch (_) {
      isValid = false;
    }
  }

  const raw = {
    id: res?.id,
    model,
    http_status,
    file_id,
    upload_status,
    error: res?.error,
    params: {
      temperature: body?.temperature ?? null,
      top_p: LLM_TOP_P,
      seed: LLM_SEED ?? null,
    },
    text_preview: (() => {
      try {
        const t = extractTextFromResponses(res) ?? "";
        return typeof t === "string" ? t.slice(0, 1200) : null;
      } catch {
        return null;
      }
    })(),
    response_snapshot: (() => {
      try {
        return JSON.stringify(res).slice(0, 6000);
      } catch {
        return null;
      }
    })(),
  } as const;
  if (raw.error) console.error("OpenAI responses error:", raw.error);
  return { parsed, raw, isValid };
}

// ========= HTTP =========
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    let payload: {
      storagePath?: string;
      sourceDocId?: string;
      model?: string | null;
      append?: boolean;
    } | null = null;
    try {
      payload = await req.json();
    } catch (_) {
      return new Response("Invalid JSON body", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { storagePath, sourceDocId, model, append } = payload ?? {};
    if (!storagePath)
      return new Response("storagePath required", {
        status: 400,
        headers: corsHeaders,
      });

    // source_docs 用意
    let docId = sourceDocId;
    if (!docId) {
      const { data, error } = await supabase
        .from("source_docs")
        .insert({ storage_path: storagePath })
        .select("id, created_at")
        .single();
      if (error) throw error;
      docId = data.id as string;
    }

    // 公開URL（Public バケット前提）
    const [bucket, ...rest] = storagePath.split("/");
    const path = rest.join("/");
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    const imageUrl = pub.publicUrl;
    if (!imageUrl) {
      throw new Error(
        "Public URL not available. Ensure bucket is Public and path is correct."
      );
    }
    // 画像/ファイルURLの疎通確認（診断用）
    let imageHeadStatus: number | null = null;
    try {
      const head = await fetch(imageUrl, { method: "HEAD" });
      imageHeadStatus = head.status;
    } catch (_) {
      imageHeadStatus = -1;
    }

    // 日付ヒント（ファイル名から）
    const inferred = inferDateFromPath(storagePath);
    const sheetHintISO = inferred ?? new Date().toISOString().slice(0, 10);

    // GPT 呼び出し（画像 or PDF）
    const isPdf = /\.pdf(?:$|\?)/i.test(path);
    const { parsed, raw, isValid } = isPdf
      ? await callGptPdf(imageUrl, sheetHintISO, model)
      : await callGptVision(imageUrl, sheetHintISO, model);
    // 応答形状差異に対応（直下 or properties 配下）
    const events: any[] = Array.isArray((parsed as any)?.events)
      ? (parsed as any).events
      : Array.isArray((parsed as any)?.properties?.events)
      ? (parsed as any).properties.events
      : [];
    const eventsCount = events.length;

    // 名簿に名寄せ（未一致は残す → レビューで修正可能）
    const roster = await fetchResidents();
    const normalized: any[] = [];
    for (const e of events || []) {
      const matched = pickResident(roster, e?.resident_name || "");
      const displayName = matched?.display_name || e?.resident_name || "";
      normalized.push({
        ...e,
        resident_name: displayName,
        _matched: !!matched,
      });
    }
    const normalizedCount = normalized.length;

    const dateFromParsed =
      (parsed as any)?.sheet?.date_iso ||
      (parsed as any)?.properties?.sheet?.date_iso;
    const dateISO: string =
      typeof dateFromParsed === "string" &&
      /\d{4}-\d{2}-\d{2}/.test(dateFromParsed)
        ? dateFromParsed
        : sheetHintISO;

    const rows = normalized
      .map((e: any) => {
        const cat = mapCategoryJPtoEN(e?.category || "");
        const isAllowed =
          cat === "urination" || cat === "defecation" || cat === "fluid";
        if (!isAllowed) return null;
        const hour = Number.isInteger(e?.hour) ? e.hour : null;
        const count =
          typeof e?.count === "number" && e.count >= 1 ? e.count : 1;
        return {
          source_doc_id: docId,
          resident_name: e?.resident_name,
          event_date: dateISO,
          hour, // 0..23
          category: cat,
          value: e?.note ?? null,
          count,
          guided: !!e?.guided,
          incontinence: !!e?.incontinence,
          confidence: typeof e?.confidence === "number" ? e.confidence : 0.75,
          needs_review: (e?.confidence ?? 1) < 0.75 || !e?._matched,
        };
      })
      .filter(
        (r) =>
          !!r &&
          Number.isInteger((r as any).hour) &&
          (r as any).event_date &&
          (r as any).resident_name &&
          (r as any).category
      ) as any[];
    const rowsCount = rows.length;

    let inserted = 0;
    if (rows.length) {
      // Overwrite-by-date: ensure the target date has no records from other source docs
      // Keep rows from this source_doc_id to support multi-page append
      const { error: dateDelErr } = await supabase
        .from("care_events")
        .delete()
        .eq("event_date", dateISO)
        .neq("source_doc_id", docId!);
      if (dateDelErr) throw dateDelErr;

      if (!append) {
        // Clean any prior rows for this source_doc_id (re-run safety)
        const { error: delErr } = await supabase
          .from("care_events")
          .delete()
          .eq("source_doc_id", docId!);
        if (delErr) throw delErr;
      }

      const { error: insErr } = await supabase.from("care_events").insert(rows);
      if (insErr) throw insErr;
      inserted = rows.length;
    }

    // 生データは source_docs.ocr_json に保存（互換目的）
    // 併存保存: events 配列（既存）に加え、患者中心ビュー parsed_alt も保存
    const patientsView = buildPatientsView(rows, dateISO);
    const { error: upErr } = await supabase
      .from("source_docs")
      .update({
        ocr_json: {
          provider: "gpt",
          parsed,
          raw: {
            ...raw,
            image_url: imageUrl,
            image_head_status: imageHeadStatus,
            events_count: eventsCount,
            normalized_count: normalizedCount,
            rows_count: rowsCount,
            schema_valid: isValid ?? null,
          },
          parsed_alt: patientsView,
        },
      })
      .eq("id", docId!);
    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({
        ok: true,
        sourceDocId: docId,
        inserted,
        events: eventsCount,
        normalized: normalizedCount,
        rows: rowsCount,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
