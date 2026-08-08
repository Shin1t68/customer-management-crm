-- ============================================================
-- 顧客管理アプリ（ひとり営業CRM）Supabase スキーマ
-- SQL Editor に貼り付けて「一発実行」で完結する構成。
-- 何度でも再実行可能（冪等）。初回実行でも安全に通る。
-- ============================================================

-- ------------------------------------------------------------
-- 0. クリーンアップ
--   DROP TRIGGER ... ON <table> は対象テーブルが無いと初回実行で
--   エラーになるため使わない。DROP TABLE IF EXISTS ... CASCADE で
--   テーブルに紐づくトリガ・ポリシー・外部キーごとまとめて削除する。
--   deals を先に落とす必要はない（customers の CASCADE で連鎖するが、
--   両方明示しておく方が意図が明確）。
-- ------------------------------------------------------------
drop table if exists public.deals cascade;
drop table if exists public.customers cascade;

-- トリガ関数は独立オブジェクトなので個別に削除（存在しなくても安全）。
drop function if exists public.set_updated_at() cascade;

-- ------------------------------------------------------------
-- 1. テーブル定義
-- ------------------------------------------------------------

-- 顧客（親）
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  company    text        not null,                      -- 会社名（必須）
  name       text        not null,                      -- 担当者名（必須）
  title      text,                                      -- 役職（任意）
  email      text,                                      -- メール（任意）
  phone      text,                                      -- 電話（任意）
  memo       text,                                      -- メモ（任意・複数行可）
  created_at timestamptz not null default now()
);

-- 商談（子）— customer_id で customers を参照（1対多）
-- 顧客削除時に紐づく商談を自動削除するため ON DELETE CASCADE。
create table public.deals (
  id          uuid        primary key default gen_random_uuid(),
  customer_id uuid        not null
                references public.customers(id) on delete cascade,
  title       text        not null,                     -- 商談名（必須）
  amount      integer,                                  -- 金額（円・任意）
  status      text        not null default 'lead'
                check (status in ('lead', 'proposal', 'won')),
  memo        text,                                     -- メモ（任意・複数行可）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 外部キー検索を高速化（顧客ごとの商談取得で使う）。
create index deals_customer_id_idx on public.deals (customer_id);

-- ------------------------------------------------------------
-- 2. updated_at 自動更新トリガ
--   保存（UPDATE）のたびに updated_at を now() に更新する。
-- ------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger deals_set_updated_at
  before update on public.deals
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. RLS 有効化 + ポリシー（Publishable key = anon ロール）
--   各テーブル 4 操作（select / insert / update / delete）を許可。
--   合計 8 ポリシー。anon ロール（Publishable key）に全操作を開放する。
-- ------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.deals     enable row level security;

-- customers（4）
create policy "customers_select_anon" on public.customers
  for select to anon using (true);
create policy "customers_insert_anon" on public.customers
  for insert to anon with check (true);
create policy "customers_update_anon" on public.customers
  for update to anon using (true) with check (true);
create policy "customers_delete_anon" on public.customers
  for delete to anon using (true);

-- deals（4）
create policy "deals_select_anon" on public.deals
  for select to anon using (true);
create policy "deals_insert_anon" on public.deals
  for insert to anon with check (true);
create policy "deals_update_anon" on public.deals
  for update to anon using (true) with check (true);
create policy "deals_delete_anon" on public.deals
  for delete to anon using (true);

-- ------------------------------------------------------------
-- 4. 初期データ（顧客3件・商談5件）
--   商談の customer_id を顧客 id と正しく紐付けるため、
--   固定 UUID を明示して INSERT する（自動採番に任せず決定的にする）。
-- ------------------------------------------------------------

insert into public.customers (id, company, name, title, email, phone, memo, created_at) values
  ('11111111-1111-1111-1111-111111111111', '株式会社サンプル商事', '山田 太郎', '営業部長',
   'yamada@sample.co.jp', '03-1234-5678', '展示会で名刺交換。反応良好。',
   '2026-04-24T09:00:00.000Z'),
  ('22222222-2222-2222-2222-222222222222', '有限会社みらいテック', '佐藤 花子', '代表取締役',
   'sato@mirai-tech.jp', '06-9876-5432', '既存顧客からの紹介。予算感は高め。',
   '2026-05-10T10:30:00.000Z'),
  ('33333333-3333-3333-3333-333333333333', 'グローバル物流株式会社', '鈴木 一郎', '購買課 課長',
   'suzuki@global-log.com', '045-222-3333', 'コスト重視。相見積もりを取っている様子。',
   '2026-06-02T14:15:00.000Z');

insert into public.deals (id, customer_id, title, amount, status, memo, created_at, updated_at) values
  -- 山田 太郎（サンプル商事）: 2件
  ('aaaaaaa1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'サービスA 導入提案', 1500000, 'proposal', '次回はデモを実施予定。',
   '2026-04-25T09:00:00.000Z', '2026-04-25T09:00:00.000Z'),
  ('aaaaaaa1-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '保守契約 追加', 300000, 'lead', 'まずはヒアリングから。',
   '2026-05-01T09:00:00.000Z', '2026-05-01T09:00:00.000Z'),
  -- 佐藤 花子（みらいテック）: 2件
  ('bbbbbbb2-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'サービスB 年間契約', 4800000, 'won', '成約。4月から稼働開始。',
   '2026-05-12T09:00:00.000Z', '2026-05-20T11:00:00.000Z'),
  ('bbbbbbb2-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'オプション機能 拡張', 900000, 'proposal', '見積もり提出済み。決裁待ち。',
   '2026-06-15T09:00:00.000Z', '2026-06-15T09:00:00.000Z'),
  -- 鈴木 一郎（グローバル物流）: 1件
  ('ccccccc3-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
   'サービスA 大口導入', 6200000, 'lead', '相見積もり中。価格勝負になりそう。',
   '2026-06-05T09:00:00.000Z', '2026-06-05T09:00:00.000Z');

-- ============================================================
-- 実行完了。追加実行が必要な SQL は残っていない。
-- ============================================================
