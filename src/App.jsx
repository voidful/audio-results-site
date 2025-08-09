import React, { useMemo, useState, useEffect } from "react";

/**
 * 音訊推理成果展示網站（單檔 React 元件 / CRA 友善）
 *
 * 使用方式
 * - 在 public/ 放置：
 *   - reasoning.json（或 JSONL；兩者都支援）
 *   - audio/*.wav（所有要播放的音檔）
 * - npm start（dev）與 GitHub Pages（prod）皆可直接讀取
 *
 * 路徑規則
 * - JSON 內的 audio_filepath 會被取「檔名」後，轉成
 *   `${process.env.PUBLIC_URL}/audio/<檔名>`
 */

export default function App() {
  const [raw, setRaw] = useState(null);            // 原始解析後的物件或陣列
  const [samples, setSamples] = useState([]);      // 正規化後的樣本
  const [metric, setMetric] = useState({
    metric: "",
    accuracy_by_sample: null,
    avg_accuracy_by_category: null,
    categories_accuracy: null,
    config: null,
  });

  // 路徑重寫：固定走 basename → PUBLIC_URL/audio/<檔名>
  const [baseUrl, setBaseUrl] = useState(() => (process.env.PUBLIC_URL || "") + "/audio/");

  // UI 狀態
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showOnlyWrong, setShowOnlyWrong] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  // 進站自動讀 public/reasoning.json（支援 JSON 或 JSONL）
  useEffect(() => {
    const url = (process.env.PUBLIC_URL || "") + "/reasoning.json";
    (async () => {
      try {
        setLoading(true);
        setLoadError("");
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`讀取失敗（HTTP ${res.status}）: ${url}`);
        const text = await res.text();

        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          // 嘗試 JSONL
          const lines = text
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          parsed = lines.map((line) => JSON.parse(line));
        }

        setRaw(parsed);
        const norm = normalizeResults(parsed);
        setSamples(norm.samples);
        setMetric(norm.metric);
        setPage(1);
      } catch (err) {
        console.error(err);
        setLoadError(String(err?.message || err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 正規化整份結果
  function normalizeResults(parsed) {
    // 形態 1：整份物件（含 results 陣列）
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const results = Array.isArray(parsed.results) ? parsed.results : [];
      const samples = results.map((r, i) => normalizeOne(r, i));
      const metric = {
        metric: parsed.metric ?? "",
        accuracy_by_sample: parsed.accuracy_by_sample ?? null,
        avg_accuracy_by_category: parsed.avg_accuracy_by_category ?? null,
        categories_accuracy: parsed.categories_accuracy ?? null,
        config: parsed.config ?? null,
      };
      return { samples, metric };
    }

    // 形態 2：JSONL 陣列（每行一個結果物件）
    if (Array.isArray(parsed)) {
      const samples = parsed.map((r, i) => normalizeOne(r, i));
      return { samples, metric: {} };
    }

    return { samples: [], metric: {} };
  }

  // 正規化單筆
  function normalizeOne(r, i) {
    const audioPaths = (r?.audios || []).map((a) => a?.audio_filepath).filter(Boolean);
    const prompt = r?.messages?.[0]?.content ?? "";
    const prediction = r?.prediction ?? r?.response ?? "";
    const label = r?.label ?? r?.target ?? "";

    return {
      index: r?.index ?? i,
      audioPaths,
      prompt,
      prediction,
      label,
      correct: !!r?.correct,
      length: r?.length ?? null,
    };
  }

  // 清除 <think> 標籤段
  function stripThinking(s) {
    if (!s || typeof s !== "string") return "";
    const endTagIdx = s.indexOf("</think>");
    let out = endTagIdx >= 0 ? s.slice(endTagIdx + "</think>".length) : s;
    out = out.replace(/<think>[\s\S]*?<\/think>/g, "");
    return out.trim();
  }

  // 由原始路徑產出 public/audio/ 的 URL
  function audioUrl(p) {
    if (!p) return "";
    const name = (p || "").split("/").pop();
    return joinUrl(baseUrl, name);
  }

  function joinUrl(base, path) {
    if (!base) return path || "";
    let b = base.endsWith("/") ? base : base + "/";
    return b + (path || "");
  }

  // 摘要統計
  const stats = useMemo(() => {
    const n = samples.length;
    const nCorrect = samples.filter((s) => s.correct).length;
    const acc = n ? (nCorrect / n) : 0;
    return { n, nCorrect, acc };
  }, [samples]);

  // 搜尋 & 篩選 & 分頁
  const filtered = useMemo(() => {
    let list = samples;
    if (showOnlyWrong) list = list.filter((s) => !s.correct);
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      list = list.filter((s) =>
        (s.prompt || "").toLowerCase().includes(qq) ||
        stripThinking(s.prediction).toLowerCase().includes(qq) ||
        stripThinking(s.label).toLowerCase().includes(qq)
      );
    }
    return list;
  }, [samples, showOnlyWrong, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = (page - 1) * pageSize;
  const pageEnd = Math.min(filtered.length, pageStart + pageSize);
  const pageRows = filtered.slice(pageStart, pageEnd);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">音訊推理成果展示</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
        {/* 載入狀態 / 錯誤 */}
        {loading && (
          <div className="text-center text-neutral-500 py-12">讀取 reasoning.json…</div>
        )}
        {!!loadError && !loading && (
          <div className="text-center py-12">
            <div className="inline-block px-4 py-3 rounded-xl border border-red-300 bg-red-50 text-red-700">
              無法載入 <code className="font-mono">public/reasoning.json</code>：{loadError}
            </div>
          </div>
        )}

        {/* 篩選列 */}
        {!loading && !loadError && (
          <section className="bg-white rounded-2xl shadow p-4 md:p-6 border border-neutral-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }}
                  placeholder="全文搜尋（prompt / prediction / label）"
                  className="w-80 max-w-full px-3 py-2 rounded-lg border"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm flex items-center gap-2">
                  每頁
                  <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1">
                    {[30, 20, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  筆
                </label>
                <div className="text-sm">第 <b>{page}</b> / {totalPages} 頁</div>
                <div className="flex gap-2">
                  <button className="px-2 py-1 border rounded" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一頁</button>
                  <button className="px-2 py-1 border rounded" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一頁</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 結果清單 */}
        {!loading && !loadError && (
          <section className="space-y-4">
            {pageRows.map((s) => (
              <article key={s.index} className={`bg-white rounded-2xl border ${s.correct ? "border-green-200" : "border-red-200"} shadow p-4 md:p-6`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-500"># {s.index}</span>
                    {s.length != null && <span className="text-neutral-500">len: {s.length}</span>}
                  </div>
                </div>

                <div className="mt-3 grid gap-4 md:grid-cols-[260px,1fr]">
                  {/* 左側：音檔 */}
                  <div className="space-y-3">
                    {(s.audioPaths?.length ? s.audioPaths : [null]).slice(0, 1).map((p, i) => (
                      <div key={i} className="space-y-1">
                        <audio controls className="w-full" src={audioUrl(p)} />
                      </div>
                    ))}
                  </div>

                  {/* 右側：文字內容 */}
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-semibold mb-1">Prompt / 問題</div>
                      <ContentBox text={stripThinking(s.prompt)} mono={false} />
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-sm font-semibold mb-1">Prediction</div>
                        <ContentBox text={stripThinking(s.prediction)} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-1">Label</div>
                        <ContentBox text={stripThinking(s.label)} />
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {!pageRows.length && (
              <div className="text-center text-neutral-500 py-16">
                尚未載入資料或無符合條件的結果。
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="py-10 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} 音訊推理成果展示
      </footer>
    </div>
  );
}

function ContentBox({ text, mono = true }) {
  return (
    <div className={`rounded-xl border bg-neutral-50 p-3 ${mono ? "font-mono text-[12.5px] leading-5" : "text-sm"}`}>
      {text ? (
        <pre className="whitespace-pre-wrap break-words">{text}</pre>
      ) : (
        <span className="text-neutral-400">(空)</span>
      )}
    </div>
  );
}
