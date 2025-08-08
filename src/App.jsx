import React, { useMemo, useState } from "react";

/**
 * 音訊推理成果展示網站（單檔 React 元件 / CRA 友善）
 *
 * 功能
 * 1) 匯入你的評測 JSON / JSONL（支援整份物件或逐行 JSONL）
 * 2) 顯示整體指標（accuracy）、逐筆結果、可播放原始音檔
 * 3) 並列呈現 prediction 與 label（target/label 皆支援）
 * 4) 搜尋 / 篩選（只看錯誤）、分頁
 * 5) 路徑重寫：把像 /work/voidful2nlp/data/... 的檔案路徑，改成可以從網站讀取的 URL
 * 6) 匯出錯誤樣本成 CSV
 *
 * 使用方式（GitHub Pages）
 * - `public/audio/` 放 wav 檔；上傳 results.json/.jsonl
 * - Base URL 會自動推論：PUBLIC_URL/audio/（可手動覆寫）
 */

export default function ResultsSite() {
  const [raw, setRaw] = useState(null); // 原始解析後的物件或陣列
  const [samples, setSamples] = useState([]); // 正規化後的樣本
  const [metric, setMetric] = useState({
    metric: "",
    accuracy_by_sample: null,
    avg_accuracy_by_category: null,
    categories_accuracy: null,
    config: null,
  });

  // 路徑重寫設定
  const [urlMode, setUrlMode] = useState("basename"); // 'basename' | 'replace'
  const [baseUrl, setBaseUrl] = useState(inferBaseUrl());
  const [replaceFrom, setReplaceFrom] = useState("/work/voidful2nlp/data/");
  const [replaceTo, setReplaceTo] = useState(inferBaseUrl());

  function inferBaseUrl() {
    // Vite or CRA base (GitHub Pages 子路徑友善)
    const viteBase = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL)
      ? import.meta.env.BASE_URL
      : null;
    const craBase = (typeof process !== "undefined" && process.env && process.env.PUBLIC_URL)
      ? process.env.PUBLIC_URL
      : null;
    const base = (viteBase ?? craBase ?? "/");
    const b = base.endsWith("/") ? base : base + "/";
    return b + "audio/";
  }

  // 篩選 / 搜尋
  const [showOnlyWrong, setShowOnlyWrong] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function resetView() {
    setShowOnlyWrong(false);
    setQ("");
    setPage(1);
  }

  // 讀檔：支援 .json 物件與 .jsonl
  async function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let parsed = null;

    // 嘗試 JSON 解析
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      // 若非 JSON，試著當 JSONL（逐行）
      const lines = text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      try {
        parsed = lines.map((line) => JSON.parse(line));
      } catch (e) {
        alert("檔案內容不是合法的 JSON / JSONL");
        return;
      }
    }

    setRaw(parsed);
    const norm = normalizeResults(parsed);
    setSamples(norm.samples);
    setMetric(norm.metric);
    resetView();
  }

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

  function normalizeOne(r, i) {
    const audioPaths = (r?.audios || []).map((a) => a?.audio_filepath).filter(Boolean);
    const prompt = r?.messages?.[0]?.content ?? "";

    // prediction 與 label 欄位命名可能不同，做冗餘處理
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

  // 內容清理：移除 <think> ... </think> 區段，保留最後輸出
  function stripThinking(s) {
    if (!s || typeof s !== "string") return "";
    // 若含 </think>，取之後內容
    const endTagIdx = s.indexOf("</think>");
    let out = endTagIdx >= 0 ? s.slice(endTagIdx + "</think>".length) : s;
    // 移除殘餘 <think> 標記
    out = out.replace(/<think>[\s\S]*?<\/think>/g, "");
    // 收斂空白
    return out.trim();
  }

  function audioUrl(p) {
    if (!p) return "";
    if (urlMode === "basename") {
      const name = p.split("/").pop();
      return joinUrl(baseUrl, name);
    } else {
      return (p || "").replace(replaceFrom, replaceTo);
    }
  }

  function joinUrl(base, path) {
    if (!base) return path;
    if (!base.endsWith("/")) base += "/";
    return base + (path || "");
  }

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

  function exportWrongCSV() {
    const wrong = samples.filter((s) => !s.correct);
    const header = ["index", "audio", "prompt", "prediction", "label"].join(",");
    const lines = wrong.map((s) =>
      [
        s.index,
        (s.audioPaths?.[0] || "").replaceAll('"', '"'),
        jsonSafe(stripThinking(s.prompt)),
        jsonSafe(stripThinking(s.prediction)),
        jsonSafe(stripThinking(s.label)),
      ]
        .map((x) => `"${String(x).replaceAll('"', '"')}"`)
        .join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wrong_samples.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function jsonSafe(s) {
    if (s == null) return "";
    return String(s).replaceAll("\n", "\\n");
  }

  const stats = useMemo(() => {
    const n = samples.length;
    const nCorrect = samples.filter((s) => s.correct).length;
    const acc = n ? (nCorrect / n) : 0;
    return { n, nCorrect, acc };
  }, [samples]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">音訊推理成果展示</h1>
          <div className="text-sm text-neutral-600">本頁離線運作，所有資料只在你的瀏覽器解析。</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
        {/* 上傳與路徑重寫 */}
        <section className="bg-white rounded-2xl shadow p-4 md:p-6 border border-neutral-200">
          <h2 className="text-lg font-semibold mb-3">1) 匯入資料</h2>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
            <input type="file" accept=".json,.jsonl,application/json,text/plain" onChange={onFileChange} className="block text-sm" />
            <button onClick={exportWrongCSV} disabled={!samples.length} className="px-3 py-2 rounded-lg bg-neutral-900 text-white disabled:bg-neutral-300">匯出錯誤樣本 CSV</button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">音檔 URL 生成模式</div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={urlMode === "basename"} onChange={() => setUrlMode("basename")} />
                  取檔名 + Base URL
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={urlMode === "replace"} onChange={() => setUrlMode("replace")} />
                  前綴取代
                </label>
              </div>
              {urlMode === "basename" ? (
                <div className="flex items-center gap-2">
                  <div className="text-sm w-24 shrink-0">Base URL</div>
                  <input className="flex-1 px-3 py-2 rounded-lg border" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="/audio/ 或 https://cdn/.../" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm w-24 shrink-0">從</div>
                    <input className="flex-1 px-3 py-2 rounded-lg border" value={replaceFrom} onChange={(e) => setReplaceFrom(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm w-24 shrink-0">改為</div>
                    <input className="flex-1 px-3 py-2 rounded-lg border" value={replaceTo} onChange={(e) => setReplaceTo(e.target.value)} />
                  </div>
                </div>
              )}
              <p className="text-xs text-neutral-500">小撇步：若你把所有 .wav 放在網站的 /audio/ 目錄，選「取檔名 + Base URL」最直覺。</p>
            </div>

            <div className="space-y-1 text-sm">
              <div className="font-medium mb-1">摘要</div>
              <div>樣本數：<b>{stats.n}</b>，正確：<b>{stats.nCorrect}</b>，整體 Accuracy：<b>{(stats.acc * 100).toFixed(2)}%</b></div>
              {metric?.accuracy_by_sample != null && (
                <div>檔內 accuracy_by_sample：<b>{metric.accuracy_by_sample}</b></div>
              )}
              {metric?.avg_accuracy_by_category != null && (
                <div>avg_accuracy_by_category：<b>{metric.avg_accuracy_by_category}</b></div>
              )}
              {metric?.categories_accuracy && (
                <div className="mt-1">categories_accuracy：
                  <span className="inline-flex flex-wrap gap-2 ml-1">
                    {Object.entries(metric.categories_accuracy).map(([k, v]) => (
                      <span key={k} className="px-2 py-0.5 rounded bg-neutral-100 border text-xs">{k}: {v}</span>
                    ))}
                  </span>
                </div>
              )}
              {metric?.config?.model && (
                <div className="mt-1 text-neutral-600">Model：{JSON.stringify(metric.config.model)}</div>
              )}
            </div>
          </div>
        </section>

        {/* 篩選列 */}
        <section className="bg-white rounded-2xl shadow p-4 md:p-6 border border-neutral-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="全文搜尋（prompt / prediction / label）"
                className="w-80 max-w-full px-3 py-2 rounded-lg border"
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showOnlyWrong} onChange={(e) => { setShowOnlyWrong(e.target.checked); setPage(1); }} />
                只看錯誤
              </label>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm flex items-center gap-2">
                每頁
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1">
                  {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
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

        {/* 結果清單 */}
        <section className="space-y-4">
          {pageRows.map((s) => (
            <article key={s.index} className={`bg-white rounded-2xl border ${s.correct ? "border-green-200" : "border-red-200"} shadow p-4 md:p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`px-2 py-0.5 rounded-full border ${s.correct ? "bg-green-50 border-green-300 text-green-700" : "bg-red-50 border-red-300 text-red-700"}`}>
                    {s.correct ? "✔ 正確" : "✘ 錯誤"}
                  </span>
                  <span className="text-neutral-500"># {s.index}</span>
                  {s.length != null && <span className="text-neutral-500">len: {s.length}</span>}
                </div>
              </div>

              <div className="mt-3 grid gap-4 md:grid-cols-[260px,1fr]">
                {/* 左側：音檔 & 路徑 */}
                <div className="space-y-3">
                  {(s.audioPaths?.length ? s.audioPaths : [null]).slice(0, 1).map((p, i) => (
                    <div key={i} className="space-y-1">
                      <audio controls className="w-full" src={audioUrl(p)} />
                      <div className="text-xs text-neutral-500 break-all">{p ? p : "(無音檔)"}</div>
                      <div className="text-xs text-neutral-600">→ 使用 URL：{p ? audioUrl(p) : ""}</div>
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

        {/* 說明區塊 */}
        <section className="bg-white rounded-2xl shadow p-4 md:p-6 border border-neutral-200">
          <details>
            <summary className="cursor-pointer select-none font-semibold">部署說明（展開）</summary>
            <ol className="mt-3 list-decimal pl-5 space-y-2 text-sm text-neutral-700">
              <li>把本檔案放到 CRA 的 <code>src/App.jsx</code>，並確保已安裝 Tailwind。</li>
              <li>把所有 .wav 放到 <code>public/audio/</code>，用上方「URL 生成模式」映射。</li>
              <li>GitHub Pages：在 <code>package.json</code> 設定 <code>homepage</code>，執行 <code>npm run deploy</code>。</li>
            </ol>
          </details>
        </section>
      </main>

      <footer className="py-10 text-center text-xs text-neutral-500">© {new Date().getFullYear()} 音訊推理成果展示</footer>
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
