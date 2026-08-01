// 顧客管理アプリ 全ロジック。グローバル汚染を避けるため即時実行関数で包む。
(() => {
  "use strict";

  // ---- 定数 ----
  const KEY_CUSTOMERS = "crm-customers";
  const KEY_DEALS = "crm-deals";
  // ステータスは左→右の順序でカンバン列と「←」「→」遷移の基準になる
  const STATUSES = ["lead", "proposal", "won"];
  const STATUS_LABEL = { lead: "見込み", proposal: "提案", won: "成約" };
  // 淡い背景＋濃い文字のバッジ配色（見込み=グレー / 提案=オレンジ / 成約=グリーン）
  const STATUS_BADGE = {
    lead: "bg-gray-100 text-gray-600",
    proposal: "bg-[color:var(--accent-weak)] text-[color:var(--accent)]",
    won: "bg-green-100 text-green-700",
  };

  // ---- 状態 ----
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

  // ---- 永続化 ----
  const loadData = () => {
    customers = JSON.parse(localStorage.getItem(KEY_CUSTOMERS) ?? "[]");
    deals = JSON.parse(localStorage.getItem(KEY_DEALS) ?? "[]");
  };
  const saveCustomers = () => localStorage.setItem(KEY_CUSTOMERS, JSON.stringify(customers));
  const saveDeals = () => localStorage.setItem(KEY_DEALS, JSON.stringify(deals));

  // ---- ユーティリティ ----
  const nowIso = () => new Date().toISOString();
  const genId = () => String(Date.now()) + Math.floor(Math.random() * 1000);
  const findCustomer = (id) => customers.find((c) => c.id === id);
  const findDeal = (id) => deals.find((d) => d.id === id);
  const dealsOf = (customerId) => deals.filter((d) => d.customerId === customerId);
  const formatYen = (amount) =>
    typeof amount === "number" ? "¥" + amount.toLocaleString("ja-JP") : "—";
  // 作成日時の新しい順（降順）で並べた顧客配列を返す
  const sortedCustomers = () =>
    [...customers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
    return [c.company, c.contact, c.title]
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
      `<div class="text-xs text-gray-600 mt-0.5">${escapeHtml(c.contact)}` +
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
    el["detail-contact"].textContent = c.contact;
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
    el["input-contact"].value = c?.contact ?? "";
    el["input-title"].value = c?.title ?? "";
    el["input-email"].value = c?.email ?? "";
    el["input-phone"].value = c?.phone ?? "";
    el["input-memo"].value = c?.memo ?? "";
    el["customer-form-error"].classList.add("hidden");
    showPane("pane-customer-form");
  };

  const saveCustomer = () => {
    const company = el["input-company"].value.trim();
    const contact = el["input-contact"].value.trim();
    if (!company || !contact) {
      showError("customer-form-error", "会社名と担当者名は必須です");
      return;
    }
    const fields = {
      company, contact,
      title: el["input-title"].value.trim(),
      email: el["input-email"].value.trim(),
      phone: el["input-phone"].value.trim(),
      memo: el["input-memo"].value.trim(),
    };
    if (editingCustomerId) {
      Object.assign(findCustomer(editingCustomerId), fields);
    } else {
      const created = { id: genId(), ...fields, createdAt: nowIso() };
      customers.push(created);
      editingCustomerId = created.id;
    }
    saveCustomers();
    renderCustomerDetail(editingCustomerId);
  };

  const deleteCustomer = (id) => {
    const c = findCustomer(id);
    if (!c) return;
    const count = dealsOf(id).length;
    const msg = count > 0
      ? `「${c.company}」を削除します。紐付く商談${count}件も一緒に削除されます。よろしいですか？`
      : `「${c.company}」を削除します。よろしいですか？`;
    if (!confirm(msg)) return;
    customers = customers.filter((x) => x.id !== id);
    deals = deals.filter((d) => d.customerId !== id); // 連鎖削除
    saveCustomers();
    saveDeals();
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

  const saveDeal = () => {
    const title = el["input-deal-title"].value.trim();
    if (!title) {
      showError("deal-form-error", "タイトルは必須です");
      return;
    }
    const amountRaw = el["input-deal-amount"].value.trim();
    const amount = amountRaw === "" ? null : Math.round(Number(amountRaw));
    const fields = {
      title, amount,
      status: el["input-deal-status"].value,
      memo: el["input-deal-memo"].value.trim(),
      updatedAt: nowIso(),
    };
    if (editingDealId) {
      Object.assign(findDeal(editingDealId), fields);
    } else {
      deals.push({
        id: genId(), customerId: dealFormCustomerId, ...fields, createdAt: nowIso(),
      });
    }
    saveDeals();
    renderCustomerDetail(dealFormCustomerId);
  };

  const deleteDeal = (id) => {
    const d = findDeal(id);
    if (!d) return;
    if (!confirm(`商談「${d.title}」を削除します。よろしいですか？`)) return;
    const customerId = d.customerId;
    deals = deals.filter((x) => x.id !== id);
    saveDeals();
    renderCustomerDetail(customerId);
  };

  // パイプラインの「←」「→」でステータスを隣の列へ動かす（フォームを開かず直接更新）
  const moveDealStatus = (id, direction) => {
    const d = findDeal(id);
    if (!d) return;
    const idx = STATUSES.indexOf(d.status);
    const next = idx + direction;
    if (next < 0 || next >= STATUSES.length) return;
    d.status = STATUSES[next];
    d.updatedAt = nowIso();
    saveDeals();
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
    const c = findCustomer(d.customerId);
    const idx = STATUSES.indexOf(d.status);
    const card = document.createElement("div");
    card.dataset.dealId = d.id;
    card.className = `deal-kanban-card status-${d.status} bg-white rounded-lg border border-gray-200 p-3 shadow-sm`;
    card.innerHTML =
      `<div class="deal-open cursor-pointer">` +
      `<div class="text-sm font-medium">${escapeHtml(d.title)}</div>` +
      `<div class="text-xs text-gray-500 mt-0.5">${escapeHtml(c ? c.company : "（顧客不明）")}</div>` +
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
      if (d) openDealForm(d.customerId, d.id);
    }
  };

  // ---- 初期サンプルデータ（localStorageが空のときのみ） ----
  const seedIfEmpty = () => {
    if (localStorage.getItem(KEY_CUSTOMERS) !== null) return;
    const t = Date.now();
    const cs = [
      { id: "c1", company: "株式会社アオゾラ商事", contact: "田村 健一", title: "購買部 課長", email: "tamura@aozora.example", phone: "03-1111-2222", memo: "展示会で名刺交換。来期の予算取りを検討中。", createdAt: new Date(t - 3000).toISOString() },
      { id: "c2", company: "みどりテクノロジー株式会社", contact: "佐々木 遥", title: "情報システム部", email: "sasaki@midori.example", phone: "06-3333-4444", memo: "既存ツールからの乗り換えに関心あり。", createdAt: new Date(t - 2000).toISOString() },
      { id: "c3", company: "ひまわり物流合同会社", contact: "中村 誠", title: "代表社員", email: "nakamura@himawari.example", phone: "052-5555-6666", memo: "紹介経由。まずは小規模から。", createdAt: new Date(t - 1000).toISOString() },
    ];
    const ds = [
      { id: "d1", customerId: "c1", title: "サービスA導入提案", amount: 1500000, status: "proposal", memo: "次回はデモを実施", createdAt: new Date(t).toISOString(), updatedAt: new Date(t).toISOString() },
      { id: "d2", customerId: "c1", title: "保守サポート契約", amount: 300000, status: "lead", memo: "予算確認待ち", createdAt: new Date(t).toISOString(), updatedAt: new Date(t).toISOString() },
      { id: "d3", customerId: "c2", title: "全社ライセンス切替", amount: 4200000, status: "won", memo: "契約締結済み。導入支援へ", createdAt: new Date(t).toISOString(), updatedAt: new Date(t).toISOString() },
      { id: "d4", customerId: "c2", title: "追加モジュール提案", amount: 800000, status: "lead", memo: "", createdAt: new Date(t).toISOString(), updatedAt: new Date(t).toISOString() },
      { id: "d5", customerId: "c3", title: "トライアル導入", amount: 120000, status: "proposal", memo: "3拠点で試験運用", createdAt: new Date(t).toISOString(), updatedAt: new Date(t).toISOString() },
    ];
    localStorage.setItem(KEY_CUSTOMERS, JSON.stringify(cs));
    localStorage.setItem(KEY_DEALS, JSON.stringify(ds));
  };

  // ---- 起動 ----
  const init = () => {
    cacheDom();
    seedIfEmpty();
    loadData();
    bindEvents();
    showView("customers");
    showPane("pane-empty");
    renderCustomerList();
  };

  document.addEventListener("DOMContentLoaded", init);
})();
