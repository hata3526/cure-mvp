/// <reference path="../types.d.ts" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!; // secrets 済み
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!; // ← secrets 名はあなたの登録名に合わせる
const GCP_VISION_API_KEY = Deno.env.get("GCP_VISION_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    let payload: { storagePath?: string; sourceDocId?: string } | null = null;
    try {
      payload = await req.json();
    } catch (_) {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const { storagePath, sourceDocId } = payload ?? {};
    if (!storagePath)
      return new Response("storagePath required", { status: 400 });

    // source_docs を用意
    let docId = sourceDocId;
    if (!docId) {
      const { data, error } = await supabase
        .from("source_docs")
        .insert({ storage_path: storagePath })
        .select("id")
        .single();
      if (error) throw error;
      docId = data.id;
    }

    // サインURLを作成
    const [bucket, ...rest] = storagePath.split("/");
    const path = rest.join("/");
    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 600);
    if (signErr) throw signErr;

    // Vision OCR
    const visionReq = {
      requests: [
        {
          image: { source: { imageUri: signed.signedUrl } },
          features: [{ type: "TEXT_DETECTION" }],
          imageContext: { languageHints: ["ja"] },
        },
      ],
    };
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GCP_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(visionReq),
      }
    ).then((r) => r.json());

    // DB保存
    const { error: upErr } = await supabase
      .from("source_docs")
      .update({ ocr_json: visionRes })
      .eq("id", docId!);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, sourceDocId: docId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
