# CLAUDE.md — 顧客管理アプリ 開発規約

このファイルは、ひとり営業用の顧客管理アプリ（ブラウザ完結CRM）の開発ルールを定める。実装・修正・レビュー時は常にこの規約に従うこと。

---

## 1. 技術スタック

| 区分 | 採用技術 |
|---|---|
| マークアップ | HTML5（`index.html` 1枚） |
| スタイル | Tailwind CSS（CDN読み込み） + `styles.css`（補助のみ） |
| スクリプト | JavaScript（vanilla、ES2020+、フレームワーク禁止） |
| 永続化 | ブラウザの `localStorage` |
| ビルド | なし（npm・bundler・トランスパイラすべて使わない） |
| 外部通信 | なし（API・CDN経由のTailwind以外は読み込まない） |

---

## 2. ディレクトリ構成

```
s5v6-crm/
├── index.html      # マークアップ・Tailwind CDN読み込み・全ビュー/モードのDOM
├── app.js          # 全ロジック（CRUD・描画・イベント・localStorage）
├── styles.css      # Tailwindで賄えない補助スタイルのみ
├── CLAUDE.md       # 本ファイル（開発規約）
└── spec.md         # 仕様書
```

- ファイルは index.html / app.js / styles.css の **3枚で完結** させる。追加ファイルは作らない。
- 画像・アイコンはインラインSVGかUnicode絵文字で賄う（外部画像ファイル禁止）。

---

## 3. コーディング規約

### 3.1 画面切替方式

- 上部タブで **2ビュー** を切り替える。`hidden` クラスの付け外しで表示制御する。
  - `#view-customers` — 顧客ビュー（ツーカラム）
  - `#view-pipeline` — パイプラインビュー（カンバン3列）
- 顧客ビューの右ペインは **4モード** を DOM として同時に保持し、`hidden` クラスで切り替える。
  - `#pane-empty` — 何も選択していない初期状態
  - `#pane-customer-detail` — 顧客詳細（連絡先＋商談一覧）
  - `#pane-customer-form` — 顧客の新規・編集フォーム
  - `#pane-deal-form` — 商談の新規・編集フォーム
- ルーティングライブラリは使わない。ビュー切替・モード切替は専用関数 `showView(name)` / `showPane(name)` に集約する。

### 3.2 ID命名規則

- ビューは `view-*` プレフィックス（例: `view-customers`, `view-pipeline`）
- ペインは `pane-*` プレフィックス（例: `pane-empty`, `pane-customer-detail`, `pane-customer-form`, `pane-deal-form`）
- 入力要素は `input-*` プレフィックス（例: `input-company`, `input-contact`, `input-deal-title`, `input-deal-amount`）
- ボタンは `btn-*` プレフィックス（例: `btn-new-customer`, `btn-save`, `btn-delete`, `btn-edit`, `btn-cancel`, `btn-add-deal`）
- 動的生成される顧客カードは `customer-${id}`、商談カードは `deal-${id}` の形式（data属性 `data-customer-id` / `data-deal-id` も併用）

### 3.3 JavaScript規約

- **関数は50行以内**。超えたら分割する。
- **ネストは3段階まで**。早期リターン・ガード節で平坦化する。
- **変数宣言は `const` を優先**。再代入が必要なものだけ `let`。`var` は禁止。
- **グローバル汚染禁止**：`app.js` 全体を即時実行関数 `(() => { ... })()` で包む。
- **DOM参照はキャッシュ** する（都度 `getElementById` を呼ばない）。
- **イベントリスナーは集約** する。可能な限りイベントデリゲーションを使う。
- 引数が来ないケースは早期returnで弾く。

### 3.4 コメント方針

- **「なぜ」を書く**。「何をしているか」は識別子で伝える。
- TODO コメントには必ず理由を書く。
- 無意味なコメント（`// データを保存` など）は書かない。

---

## 4. データ構造

### 4.1 顧客1件のオブジェクト

```js
{
  id: "1714012345678",            // 文字列、Date.now() ベースで自動採番
  company: "株式会社サンプル",     // 必須
  contact: "山田 太郎",            // 必須（担当者名）
  title: "営業部長",              // 任意
  email: "taro@example.com",     // 任意
  phone: "03-1234-5678",         // 任意
  memo: "展示会で名刺交換",       // 任意、複数行可
  createdAt: "2026-04-24T09:00:00.000Z" // ISO文字列、必須
}
```

### 4.2 商談1件のオブジェクト

```js
{
  id: "1714012399999",            // 文字列、Date.now() ベースで自動採番
  customerId: "1714012345678",   // 必須、顧客のidと一致（1対多の親）
  title: "サービスA導入提案",     // 必須
  amount: 1500000,                // 整数（円）、任意
  status: "lead",                // "lead" / "proposal" / "won" のいずれか
  memo: "次回はデモを実施",       // 任意、複数行可
  createdAt: "2026-04-24T09:00:00.000Z", // 必須
  updatedAt: "2026-04-24T09:00:00.000Z"  // 保存のたびに更新
}
```

### 4.3 localStorage

- **顧客キー**: `crm-customers` — 顧客オブジェクトの配列（JSON文字列）
- **商談キー**: `crm-deals` — 商談オブジェクトの配列（JSON文字列）
- 読み込み: `JSON.parse(localStorage.getItem("crm-customers") ?? "[]")`
- 保存: `localStorage.setItem("crm-customers", JSON.stringify(customers))`
- 顧客の表示順は **作成日時の新しい順**（`createdAt` の降順）。保存時は順序不問。
- **1対多の紐付け**: 商談は `customerId` で顧客を参照する。顧客削除時は同じ `customerId` を持つ商談をまとめて削除する（連鎖削除）。

---

## 5. デザイン規約

| 要素 | ルール |
|---|---|
| 背景 | 白（`#ffffff`）基調 |
| アクセント | `#c15f3c`（Claudeオレンジ）— ボタン・選択状態・アクセント線 |
| テキスト | グレースケール（`text-gray-900` / `text-gray-600` / `text-gray-400`） |
| フォント | `"游ゴシック", "Yu Gothic", sans-serif` |
| 角丸 | `rounded-lg`（8px）で統一 |
| 影 | `shadow-sm` までに抑える。`shadow-lg` 以上は使わない |
| ボタン | プライマリはオレンジ背景・白文字、セカンダリは白背景・グレー枠線 |
| 顧客ビュー | 左340px固定 + 右flex-1 の2カラム。`flex` で組む |
| パイプライン | 3列をflexで等幅配置。列ヘッダにステータス名と件数 |
| 選択中の顧客カード | 左にオレンジの縦ライン + 薄いオレンジ背景 |
| ステータスバッジ | 見込み=グレー、提案=オレンジ、成約=グリーン（淡い背景＋濃い文字） |
| 商談カード（カンバン） | 左に3pxのアクセントラインをステータス色で表示 |

---

## 6. ワークフロー

1. 変更前に既存コードを読む
2. CLAUDE.md / spec.md の規約に沿って実装する
3. ブラウザで実際に開いて動作確認する
4. 顧客と商談のCRUD全操作（作成・一覧・詳細・編集・削除）、ステータス遷移（パイプラインの「←」「→」）、顧客削除時の商談連鎖削除が動くことを確認する

---

## 7. やってはいけないこと

- `npm install` / `package.json` の作成 — ビルド環境は作らない
- webpack / vite / parcel / esbuild など **バンドラ禁止**
- React / Vue / Svelte などの **フレームワーク禁止**
- サーバーサイド（Node.js / Express / Next.js API など）の導入禁止
- localStorage 以外の永続化（IndexedDB・外部DB・クラウドストレージ）
- 外部API呼び出し（`fetch` による通信）
- 外部画像ファイルのダウンロード・同梱
- モバイル対応のためのCSS追加（PC表示のみで十分）
- ドラッグ＆ドロップによるカンバン操作（クリック式の「←」「→」で代替する）
