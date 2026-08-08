# 顧客管理アプリ（ひとり営業CRM）

ブラウザだけで完結する、ひとり営業向けの顧客管理アプリです。顧客と商談を登録・検索・編集でき、「見込み → 提案 → 成約」のパイプラインを3列カンバンで見渡せます。

`spec.md` の仕様と `CLAUDE.md` の開発規約に沿って、スペック駆動で実装しました。

## 特徴

- **顧客管理**: 会社名・担当者・役職・連絡先・メモの登録／検索／編集／削除
- **商談管理**: 顧客に紐づく商談（タイトル・金額・ステータス・メモ）の CRUD
- **パイプライン**: 見込み／提案／成約の3列カンバン。「←」「→」でステータスを移動
- **連鎖削除**: 顧客を削除すると紐づく商談もまとめて削除（DBの `ON DELETE CASCADE`）
- **永続化**: Supabase（Postgres）に保存し、どの端末からでも同じデータを参照

## 技術スタック

- HTML5 + Tailwind CSS（CDN）
- Vanilla JavaScript（ESモジュール、フレームワークなし）
- ビルド: Vite
- 永続化: Supabase（`@supabase/supabase-js`）

フロントの実装は `index.html` / `app.js` / `styles.css` の3枚に集約しています。

## セットアップ

1. Supabase プロジェクトを作り、SQL Editor で [supabase.sql](supabase.sql) を実行（テーブル・RLS・初期データを作成）。
2. `.env` を作成し、接続情報を記入（このファイルはコミットしない）。

   ```bash
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
   ```

3. 依存をインストールして開発サーバーを起動。

   ```bash
   npm install
   npm run dev
   # → http://localhost:5173/
   ```

## データ構造

- 顧客: Supabase テーブル `customers`
- 商談: Supabase テーブル `deals`（`customer_id` で顧客を参照）

詳細は [spec.md](spec.md) を参照してください。
