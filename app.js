// 顧客管理アプリ 全ロジック。グローバル汚染を避けるため即時実行関数で包む。
// 永続化は Supabase（Postgres）。Publishable key で RLS 越しに読み書きする。
import { createClient } from "@supabase/supabase-js";

(() => {
  "use strict";

  // ---- Supabase 接続設定 ----
  // URL / Publishable key は .env（VITE_ プレフィックス）から Vite が注入する。
  const sb = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );

  // ---- 定数 ----
  // ステータスは左→右の順序でカンバン列と「←」「→」遷移の基準になる
  const STATUSES = ["lead", "proposal", "won"];
  const STATUS_LABEL = { lead: "見込み", proposal: "提案", won: "成約" };
  // 淡い背景＋濃い文字のバッジ配色（見込み=グレー / 提案=オレンジ / 成約=グリーン）
  const STATUS_BADGE = {
    lead: "bg-gray-100 text-gray-600",
    proposal: "bg-[color:var(--accent-weak)] text-[color:var(--accent)]",
    won: "bg-green-100 text-green-700",
  };

  // ---- 状態（Supabase から取得した行のローカルキャッシュ） ----
  let customers = [];
  let deals = [];
  let selectedCustomerId = null; // 現在詳細表示中の顧客
  let editingCustomerId = null; // 顧客フォームが編集中の対象（新規は null）
  let editingDealId = null; // 商談フォームが編集中の対象（新規は null）
  let dealFormCustomerId = null; // 商談フォームが属する顧客

  // ---- DOM参照キャッシュ（都度getElementByIdを呼ばない） ----
  const el = {};
  const cacheDom = () => {
    const ids = [
      "tab-customers", "tab-pipeline", "view-customers", "view-pipeline",
      "input-search", "btn-new-customer", "customer-list",
      "pane-empty", "pane-customer-detail", "pane-customer-form", "pane-deal-form",
      "btn-edit", "btn-delete", "btn-add-deal",
      "detail-company", "detail-contact", "detail-title", "detail-email",
      "detail-phone", "detail-memo", "detail-deals",
      "btn-cancel-customer", "customer-form-title", "customer-form-error",
      "input-company", "input-contact", "input-title", "input-email",
      "input-phone", "input-memo", "btn-save-customer",
      "btn-cancel-deal", "deal-form-title", "deal-form-customer", "deal-form-error",
      "input-deal-title", "input-deal-amount", "input-deal-status", "input-deal-memo",
      "btn-save-deal", "btn-delete-deal",
    ];
    ids.forEach((id) => { el[id] = document.getElementById(id); });
  };

  // ---- 永続化（Supabase）----
  // 顧客は作成日時の新しい順で取得。商談は customer_id で紐付くので順序不問。
  const loadData = async () => {
    const [cRes, dRes] = await Promise.all([
      sb.from("customers").select("*").order("created_at", { ascending: false }),
      // 商談カードに会社名を出すため、親 customers の company を結合して取得
      sb.from("deals").select("*, customers(company)"),
    ]);
    if (cRes.error) throw cRes.error;
    if (dRes.error) throw dRes.error;
    customers = cRes.data;
    deals = dRes.data;
  };

  // ---- ユーティリティ ----
  const findCustomer = (id) => customers.find((c) => c.id === id);
  const findDeal = (id) => deals.find((d) => d.id === id);
  const dealsOf = (customerId) => deals.filter((d) => d.customer_id === customerId);
  // 結合した customers(company) を優先し、無ければ顧客キャッシュから会社名を引く
  const dealCompany = (d) =>
    d.customers?.company ?? findCustomer(d.customer_id)?.company ?? "（顧客不明）";
  const formatYen = (amount) =>
    typeof amount === "number" ? "¥" + amount.toLocaleString("ja-JP") : "—";
  // 作成日時の新しい順（降順）で並べた顧客配列を返す
  const sortedCustomers = () =>
    [...customers].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const escapeHtml = (str) =>
    String(str ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));

  // ---- ビュー／モード切替 ----
  const showView = (name) => {
    const isCustomers = name === "customers";
    el["view-customers"].classList.toggle("hidden", !isCustomers);
    el["view-pipeline"].classList.toggle("hidden", isCustomers);
    // タブのアクティブ表示
    setTabActive(el["tab-customers"], isCustomers);
    setTabActive(el["tab-pipeline"], !isCustomers);
    if (!isCustomers) renderPipeline();
  };

  const setTabActive = (tab, active) => {
    tab.classList.toggle("bg-[color:var(--accent)]", active);
    tab.classList.toggle("text-white", active);
    tab.classList.toggle("text-gray-600", !active);
    tab.classList.toggle("hover:bg-gray-100", !active);
  };

  const PANES = ["pane-empty", "pane-customer-detail", "pane-customer-form", "pane-deal-form"];
  const showPane = (name) => {
    PANES.forEach((p) => el[p].classList.toggle("hidden", p !== name));
  };

  // ---- 顧客リスト描画（左ペイン） ----
  const renderCustomerList = () => {
    const keyword = el["input-search"].value.trim().toLowerCase();
    const list = sortedCustomers().filter((c) => matchesKeyword(c, keyword));
    el["customer-list"].innerHTML = "";
    if (list.length === 0) {
      el["customer-list"].innerHTML =
        '<p class="text-gray-400 text-sm text-center py-8">該当する顧客がいません</p>';
      return;
    }
    list.forEach((c) => el["customer-list"].appendChild(buildCustomerCard(c)));
  };

  // 会社名・担当者名・役職を横断検索
  const matchesKeyword = (c, keyword) => {
    if (!keyword) return true;
    return [c.company, c.name, c.title]
      .some((v) => (v ?? "").toLowerCase().includes(keyword));
  };

  const buildCustomerCard = (c) => {
    const count = dealsOf(c.id).length;
    const div = document.createElement("div");
    div.id = `customer-${c.id}`;
    div.dataset.customerId = c.id;
    div.className =
      "customer-card cursor-pointer rounded-lg border border-gray-200 p-3 hover:bg-gray-50" +
      (c.id === selectedCustomerId ? " is-selected" : "");
    div.innerHTML =
      `<div class="font-medium text-sm">${escapeHtml(c.company)}</div>` +
      `<div class="text-xs text-gray-600 mt-0.5">${escapeHtml(c.name)}` +
      (c.title ? ` <span class="text-gray-400">${escapeHtml(c.title)}</span>` : "") +
      `</div>` +
      `<div class="text-xs text-gray-400 mt-1">商談 ${count}件</div>`;
    return div;
  };

  // ---- 顧客詳細描画（右ペイン モード2） ----
  const renderCustomerDetail = (id) => {
    const c = findCustomer(id);
    if (!c) return;
    selectedCustomerId = id;
    el["detail-company"].textContent = c.company;
    el["detail-contact"].textContent = c.name;
    el["detail-title"].textContent = c.title ? `／${c.title}` : "";
    el["detail-email"].textContent = c.email || "—";
    el["detail-phone"].textContent = c.phone || "—";
    el["detail-memo"].textContent = c.memo || "—";
    renderDetailDeals(id);
    showPane("pane-customer-detail");
    renderCustomerList(); // 選択ハイライトを反映
  };

  const renderDetailDeals = (customerId) => {
    const box = el["detail-deals"];
    box.innerHTML = "";
    const list = dealsOf(customerId);
    if (list.length === 0) {
      box.innerHTML = '<p class="text-gray-400 text-sm">商談はまだありません</p>';
      return;
    }
    list.forEach((d) => box.appendChild(buildDealRow(d)));
  };

  const buildDealRow = (d) => {
    const row = document.createElement("div");
    row.dataset.dealId = d.id;
    row.className =
      "deal-row cursor-pointer flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50";
    row.innerHTML =
      `<span class="text-sm font-medium truncate">${escapeHtml(d.title)}</span>` +
      `<span class="flex items-center gap-3 shrink-0">` +
      `<span class="text-sm text-gray-600">${formatYen(d.amount)}</span>` +
      `<span class="text-xs px-2 py-0.5 rounded-lg ${STATUS_BADGE[d.status]}">${STATUS_LABEL[d.status]}</span>` +
      `</span>`;
    return row;
  };

  // ---- 顧客フォーム（右ペイン モード3） ----
  const openCustomerForm = (id) => {
    editingCustomerId = id ?? null;
    const c = id ? findCustomer(id) : null;
    el["customer-form-title"].textContent = c ? "編集" : "新規顧客";
    el["input-company"].value = c?.company ?? "";
    el["input-contact"].value = c?.name ?? "";
    el["input-title"].value = c?.title ?? "";
    el["input-email"].value = c?.email ?? "";
    el["input-phone"].value = c?.phone ?? "";
    el["input-memo"].value = c?.memo ?? "";
    el["customer-form-error"].classList.add("hidden");
    showPane("pane-customer-form");
  };

  const saveCustomer = async () => {
    const company = el["input-company"].value.trim();
    const name = el["input-contact"].value.trim();
    if (!company || !name) {
      showError("customer-form-error", "会社名と担当者名は必須です");
      return;
    }
    // id / created_at は DB のデフォルトに任せるため送らない
    const fields = {
      company, name,
      title: el["input-title"].value.trim(),
      email: el["input-email"].value.trim(),
      phone: el["input-phone"].value.trim(),
      memo: el["input-memo"].value.trim(),
    };
    try {
      const saved = await upsertCustomer(fields);
      renderCustomerDetail(saved.id);
    } catch (e) {
      showError("customer-form-error", "保存に失敗しました：" + e.message);
    }
  };

  // 編集なら UPDATE、新規なら INSERT。保存後の行でローカルキャッシュを更新する。
  const upsertCustomer = async (fields) => {
    if (editingCustomerId) {
      const { data, error } = await sb.from("customers")
        .update(fields).eq("id", editingCustomerId).select().single();
      if (error) throw error;
      Object.assign(findCustomer(editingCustomerId), data);
      return data;
    }
    const { data, error } = await sb.from("customers")
      .insert(fields).select().single();
    if (error) throw error;
    customers.push(data);
    editingCustomerId = data.id;
    return data;
  };

  const deleteCustomer = async (id) => {
    const c = findCustomer(id);
    if (!c) return;
    const count = dealsOf(id).length;
    const msg = count > 0
      ? `「${c.company}」を削除します。紐付く商談${count}件も一緒に削除されます。よろしいですか？`
      : `「${c.company}」を削除します。よろしいですか？`;
    if (!confirm(msg)) return;
    // 商談は DB 側の ON DELETE CASCADE で消えるので、顧客のみ削除すればよい
    const { error } = await sb.from("customers").delete().eq("id", id);
    if (error) {
      alert("削除に失敗しました：" + error.message);
      return;
    }
    customers = customers.filter((x) => x.id !== id);
    deals = deals.filter((d) => d.customer_id !== id); // ローカルキャッシュも連鎖削除
    selectedCustomerId = null;
    showPane("pane-empty");
    renderCustomerList();
  };

  // ---- 商談フォーム（右ペイン モード4） ----
  const openDealForm = (customerId, dealId) => {
    dealFormCustomerId = customerId;
    editingDealId = dealId ?? null;
    const d = dealId ? findDeal(dealId) : null;
    const c = findCustomer(customerId);
    el["deal-form-title"].textContent = d ? "商談を編集" : "新規商談";
    el["deal-form-customer"].textContent = c ? c.company : "";
    el["input-deal-title"].value = d?.title ?? "";
    el["input-deal-amount"].value = typeof d?.amount === "number" ? d.amount : "";
    el["input-deal-status"].value = d?.status ?? "lead";
    el["input-deal-memo"].value = d?.memo ?? "";
    el["btn-delete-deal"].classList.toggle("hidden", !dealId);
    el["deal-form-error"].classList.add("hidden");
    showView("customers");
    showPane("pane-deal-form");
  };

  const saveDeal = async () => {
    const title = el["input-deal-title"].value.trim();
    if (!title) {
      showError("deal-form-error", "タイトルは必須です");
      return;
    }
    const amountRaw = el["input-deal-amount"].value.trim();
    const amount = amountRaw === "" ? null : Math.round(Number(amountRaw));
    // updated_at は DB のトリガが UPDATE 時に自動更新するため送らない
    const fields = {
      title, amount,
      status: el["input-deal-status"].value,
      memo: el["input-deal-memo"].value.trim(),
    };
    try {
      await upsertDeal(fields);
      renderCustomerDetail(dealFormCustomerId);
    } catch (e) {
      showError("deal-form-error", "保存に失敗しました：" + e.message);
    }
  };

  const upsertDeal = async (fields) => {
    if (editingDealId) {
      const { data, error } = await sb.from("deals")
        .update(fields).eq("id", editingDealId).select("*, customers(company)").single();
      if (error) throw error;
      Object.assign(findDeal(editingDealId), data);
      return data;
    }
    const { data, error } = await sb.from("deals")
      .insert({ ...fields, customer_id: dealFormCustomerId })
      .select("*, customers(company)").single();
    if (error) throw error;
    deals.push(data);
    return data;
  };

  const deleteDeal = async (id) => {
    const d = findDeal(id);
    if (!d) return;
    if (!confirm(`商談「${d.title}」を削除します。よろしいですか？`)) return;
    const customerId = d.customer_id;
    const { error } = await sb.from("deals").delete().eq("id", id);
    if (error) {
      alert("削除に失敗しました：" + error.message);
      return;
    }
    deals = deals.filter((x) => x.id !== id);
    renderCustomerDetail(customerId);
  };

  // パイプラインの「←」「→」でステータスを隣の列へ動かす（フォームを開かず直接更新）
  const moveDealStatus = async (id, direction) => {
    const d = findDeal(id);
    if (!d) return;
    const idx = STATUSES.indexOf(d.status);
    const next = idx + direction;
    if (next < 0 || next >= STATUSES.length) return;
    const { data, error } = await sb.from("deals")
      .update({ status: STATUSES[next] }).eq("id", id).select("*, customers(company)").single();
    if (error) {
      alert("更新に失敗しました：" + error.message);
      return;
    }
    Object.assign(d, data); // updated_at も含め DB の値で更新
    renderPipeline();
  };

  // ---- パイプライン描画（ビュー②） ----
  const renderPipeline = () => {
    STATUSES.forEach((status) => {
      const column = document.querySelector(`[data-column="${status}"]`);
      const list = deals.filter((d) => d.status === status);
      document.querySelector(`[data-count="${status}"]`).textContent = list.length;
      column.innerHTML = "";
      if (list.length === 0) {
        column.innerHTML = '<p class="text-gray-400 text-xs text-center py-4">なし</p>';
        return;
      }
      list.forEach((d) => column.appendChild(buildKanbanCard(d)));
    });
  };

  const buildKanbanCard = (d) => {
    const idx = STATUSES.indexOf(d.status);
    const card = document.createElement("div");
    card.dataset.dealId = d.id;
    card.className = `deal-kanban-card status-${d.status} bg-white rounded-lg border border-gray-200 p-3 shadow-sm`;
    card.innerHTML =
      `<div class="deal-open cursor-pointer">` +
      `<div class="text-sm font-medium">${escapeHtml(d.title)}</div>` +
      `<div class="text-xs text-gray-500 mt-0.5">${escapeHtml(dealCompany(d))}</div>` +
      `<div class="text-sm text-gray-600 mt-1">${formatYen(d.amount)}</div>` +
      `</div>` +
      `<div class="flex justify-end gap-1 mt-2">` +
      (idx > 0
        ? `<button class="btn-move px-2 py-0.5 rounded-lg border border-gray-300 text-xs hover:bg-gray-50" data-dir="-1">←</button>`
        : "") +
      (idx < STATUSES.length - 1
        ? `<button class="btn-move px-2 py-0.5 rounded-lg border border-gray-300 text-xs hover:bg-gray-50" data-dir="1">→</button>`
        : "") +
      `</div>`;
    return card;
  };

  const showError = (id, msg) => {
    el[id].textContent = msg;
    el[id].classList.remove("hidden");
  };

  // ---- イベント登録（デリゲーション中心に集約） ----
  const bindEvents = () => {
    el["tab-customers"].addEventListener("click", () => showView("customers"));
    el["tab-pipeline"].addEventListener("click", () => showView("pipeline"));

    el["input-search"].addEventListener("input", renderCustomerList);
    el["btn-new-customer"].addEventListener("click", () => openCustomerForm(null));

    // 顧客リスト（カードクリック）
    el["customer-list"].addEventListener("click", (e) => {
      const card = e.target.closest("[data-customer-id]");
      if (card) renderCustomerDetail(card.dataset.customerId);
    });

    // 顧客詳細
    el["btn-edit"].addEventListener("click", () => openCustomerForm(selectedCustomerId));
    el["btn-delete"].addEventListener("click", () => deleteCustomer(selectedCustomerId));
    el["btn-add-deal"].addEventListener("click", () => openDealForm(selectedCustomerId, null));
    el["detail-deals"].addEventListener("click", (e) => {
      const row = e.target.closest("[data-deal-id]");
      if (row) openDealForm(selectedCustomerId, row.dataset.dealId);
    });

    // 顧客フォーム
    el["btn-save-customer"].addEventListener("click", saveCustomer);
    el["btn-cancel-customer"].addEventListener("click", cancelCustomerForm);

    // 商談フォーム
    el["btn-save-deal"].addEventListener("click", saveDeal);
    el["btn-delete-deal"].addEventListener("click", () => deleteDeal(editingDealId));
    el["btn-cancel-deal"].addEventListener("click", () => renderCustomerDetail(dealFormCustomerId));

    // パイプライン（カード全体でデリゲーション）
    el["view-pipeline"].addEventListener("click", onPipelineClick);
  };

  const cancelCustomerForm = () => {
    // 編集からのキャンセルは詳細へ、新規からのキャンセルは元の状態へ戻す
    if (selectedCustomerId) renderCustomerDetail(selectedCustomerId);
    else showPane("pane-empty");
  };

  const onPipelineClick = (e) => {
    const moveBtn = e.target.closest(".btn-move");
    if (moveBtn) {
      const card = moveBtn.closest("[data-deal-id]");
      moveDealStatus(card.dataset.dealId, Number(moveBtn.dataset.dir));
      return;
    }
    const opener = e.target.closest(".deal-open");
    if (opener) {
      const card = opener.closest("[data-deal-id]");
      const d = findDeal(card.dataset.dealId);
      if (d) openDealForm(d.customer_id, d.id);
    }
  };

  // ---- 起動 ----
  const init = async () => {
    cacheDom();
    bindEvents();
    showView("customers");
    showPane("pane-empty");
    el["customer-list"].innerHTML =
      '<p class="text-gray-400 text-sm text-center py-8">読み込み中…</p>';
    try {
      await loadData();
      renderCustomerList();
    } catch (e) {
      el["customer-list"].innerHTML =
        `<p class="text-red-600 text-sm text-center py-8">読み込みに失敗しました：${escapeHtml(e.message)}</p>`;
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();
