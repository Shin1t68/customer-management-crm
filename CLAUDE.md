# CLAUDE.md — 顧客管理アプリ 開発規約

このファイルは、ひとり営業用の顧客管理アプリ（ブラウザ完結CRM）の開発ルールを定める。実装・修正・レビュー時は常にこの規約に従うこと。

---

## 1. 技術スタック

| 区分 | 採用技術 |
|---|---|
| マークアップ | HTML5（`index.html` 1枚） |
| スタイル | Tailwind CSS（CDN読み込み） + `styles.css`（補助のみ） |
| スクリプト | JavaScript（vanilla、ES2020+、ESモジュール、フレームワーク禁止） |
| 永続化 | Supabase（Postgres）— `@supabase/supabase-js` を npm 依存として利用 |
| ビルド | Vite（`npm run dev` / `npm run build`）。バンドルは Vite に任せる |
| 外部通信 | Supabase REST（`supabase-js`経由）＋CDN（Tailwind）のみ |

---

## 2. ディレクトリ構成

```
s5v6-crm/
├── index.html      # Vite エントリ。Tailwind CDN読み込み・全ビュー/モードのDOM・app.js を module 読み込み
├── app.js          # 全ロジック（CRUD・描画・イベント・Supabaseアクセス）。ESモジュール
├── styles.css      # Tailwindで賄えない補助スタイルのみ
├── package.json    # Vite / supabase-js の依存とスクリプト（dev / build / preview）
├── .env            # VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY（gitignore対象）
├── .gitignore      # .env / node_modules / dist を除外
├── CLAUDE.md       # 本ファイル（開発規約）
└── spec.md         # 仕様書

supabase.sql        # Supabaseスキーマ（テーブル・RLS・初期データ）。SQL Editorで一発実行
```

- フロントの実装は index.html / app.js / styles.css の **3枚に集約** する。ロジックは app.js に寄せる。
- ビルド・依存管理は Vite / npm（`package.json`）に任せる。`node_modules` はコミットしない。
- 接続情報は `.env`（`VITE_` プレフィックス）に置き、`import.meta.env` 経由で参照する。鍵は絶対にコミットしない。
- DBスキーマは `supabase.sql` に集約する（SQL Editorで一発実行できる冪等スクリプト）。追加実行が必要なSQLを残さない。
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
- **グローバル汚染禁止**：`app.js` は ESモジュール（`import`）で読み込み、加えて全体を即時実行関数 `(() => { ... })()` で包む。`import` はファイル先頭に置く。
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
  id: "d290f1ee-6c54-4b01-90e6-d701748f0851", // uuid、DBが gen_random_uuid() で自動採番
  company: "株式会社サンプル",     // 必須
  name: "山田 太郎",              // 必須（担当者名）
  title: "営業部長",              // 任意
  email: "taro@example.com",     // 任意
  phone: "03-1234-5678",         // 任意
  memo: "展示会で名刺交換",       // 任意、複数行可
  created_at: "2026-04-24T09:00:00.000Z" // ISO文字列、DBが now() で自動設定
}
```

### 4.2 商談1件のオブジェクト

```js
{
  id: "9b2e7c1a-3f4d-4a2b-8c5e-1d6f0a9b8c7d", // uuid、DBが gen_random_uuid() で自動採番
  customer_id: "d290f1ee-6c54-4b01-90e6-d701748f0851", // 必須、顧客のidと一致（1対多の親）
  title: "サービスA導入提案",     // 必須
  amount: 1500000,                // 整数（円）、任意
  status: "lead",                // "lead" / "proposal" / "won" のいずれか
  memo: "次回はデモを実施",       // 任意、複数行可
  created_at: "2026-04-24T09:00:00.000Z", // DBが now() で自動設定
  updated_at: "2026-04-24T09:00:00.000Z"  // 保存のたびにDBトリガが自動更新
}
```

### 4.3 Supabase

- **テーブル**: `customers`（顧客）と `deals`（商談）の2テーブル。スキーマは `supabase.sql`。
- **接続**: `app.js` 冒頭の `SUPABASE_URL` / `SUPABASE_KEY`（Publishable key）で `createClient` する。
- 読み込み: `sb.from("customers").select("*").order("created_at", { ascending: false })`
- 保存: INSERT時は `id` / `created_at` を送らずDBのデフォルトに任せる。UPDATE時の `updated_at` はDBトリガが自動更新するため送らない。
- 顧客の表示順は **作成日時の新しい順**（`created_at` の降順）。DB側で order して取得する。
- **1対多の紐付け**: 商談は `customer_id` で顧客を参照する。顧客削除時はDBの `ON DELETE CASCADE` で紐付く商談が自動削除される（アプリ側で個別DELETEしない）。
- **RLS**: 両テーブルで有効化し、Publishable key（anonロール）に select / insert / update / delete を許可するポリシーを各テーブル4つ設定する。

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

- React / Vue / Svelte などの **フレームワーク禁止**（UIは vanilla JS を維持）
- Vite / npm 以外のビルド系（webpack / parcel など）への乗り換え禁止
- `.env`（Supabaseの鍵）をリポジトリにコミットしない
- 自前のサーバーサイド実装（Node.js / Express / Next.js API など）の追加禁止 — 永続化はSupabase（BaaS）に任せる
- Supabase 以外の永続化の併用禁止（localStorage・IndexedDB・他DB・クラウドストレージ）
- Supabase 以外の外部API呼び出し（他サービスへの `fetch` 通信）
- 外部画像ファイルのダウンロード・同梱
- モバイル対応のためのCSS追加（PC表示のみで十分）
- ドラッグ＆ドロップによるカンバン操作（クリック式の「←」「→」で代替する）
