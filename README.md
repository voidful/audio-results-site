# 音訊推理成果展示（CRA + Tailwind + GitHub Pages）

## 快速開始
```bash
npm i
npm start
```
在 `http://localhost:3000` 打開後：上傳你的 `.json/.jsonl` 結果檔，音檔放 `public/audio/`。

## 部署到 GitHub Pages
1. 編輯 `package.json` 的 `homepage`：`https://<YOUR_GH_USERNAME>.github.io/<YOUR_REPO_NAME>`
2. 初始化 Git 並推上去：
```bash
git init
git add -A
git commit -m "init"
git branch -M main
git remote add origin git@github.com:<YOUR_GH_USERNAME>/<YOUR_REPO_NAME>.git
git push -u origin main
```
3. 部署：
```bash
npm run deploy
```

## Tailwind 設定
已配置 `tailwind.config.js`、`postcss.config.js`，並在 `src/index.css` 啟用。

## 音檔 URL
預設會依據 `PUBLIC_URL` 推論 Base URL（GitHub Pages 子路徑友善），也可在頁面上手動覆寫。
