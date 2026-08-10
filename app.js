const loginScreen = document.querySelector("#loginScreen");
const appShell = document.querySelector("#appShell");
const loginForm = document.querySelector("#loginForm");
const loginButton = document.querySelector("#loginButton");
const loginStatus = document.querySelector("#loginStatus");
const passwordInput = document.querySelector("#password");
const authLoading = document.querySelector("#authLoading");
const contentArea = document.querySelector("#contentArea");
const viewTitle = document.querySelector("#viewTitle");
const navItems = [...document.querySelectorAll(".nav-item")];
const logoutButton = document.querySelector("#logoutButton");
const userChip = document.querySelector("#userChip");

const config = typeof STOCK_ADMIN_CONFIG === "undefined"
  ? window.STOCK_ADMIN_CONFIG || {
    ENVIRONMENT: document.documentElement.dataset.stockAdminEnvironment,
    API_BASE_URL: document.documentElement.dataset.stockAdminApiBaseUrl,
  }
  : STOCK_ADMIN_CONFIG;
const SESSION_TOKEN_KEY = "stock-admin-test-session-token";
const PRODUCT_PAGE_SIZE = 20;

let currentUser = null;
let activeViewName = "home";
let productSearchTimer = null;
let productDom = null;
const productState = {
  initialized: false,
  query: "",
  page: 1,
  hasMore: false,
  loading: false,
  error: "",
  items: [],
  detail: null,
  detailLoading: false,
  detailError: "",
  requestId: 0,
};

const views = {
  home: {
    title: "หน้าแรก",
    render: renderHome,
  },
  orders: {
    title: "ใบสั่งของ",
    render: () => renderPlaceholder("ใบสั่งของ", "พื้นที่ตัวอย่างสำหรับเมนูใบสั่งของ ยังไม่มีข้อมูลหรือ logic จริง"),
  },
  products: {
    title: "สินค้า",
    render: renderProductView,
  },
  stock: {
    title: "สต๊อก",
    render: () => renderPlaceholder("สต๊อก", "พื้นที่ตัวอย่างสำหรับเมนูสต๊อก ยังไม่มีการเชื่อมต่อคลังสินค้า"),
  },
  more: {
    title: "เพิ่มเติม",
    render: () => renderPlaceholder("เพิ่มเติม", "พื้นที่ตัวอย่างสำหรับเมนูเพิ่มเติม ยังไม่มีการตั้งค่าระบบ"),
  },
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    showLoginMessage("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน", "error");
    return;
  }

  setLoginLoading(true);
  showLoginMessage("", "info");

  try {
    const response = await callAuthApi("login", { username, password });
    const data = requireSuccess(response);

    if (!data.sessionToken || !data.user) {
      throw new Error("BACKEND_RESPONSE_INVALID");
    }

    sessionStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);
    enterApp(data.user);
  } catch (error) {
    clearSessionToken();
    showLogin();
    showLoginMessage(toThaiErrorMessage(error), "error");
  } finally {
    setLoginLoading(false);
    passwordInput.value = "";
  }
});

navItems.forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.view));
});

logoutButton.addEventListener("click", async () => {
  const token = getSessionToken();
  setAppBusy(true);

  try {
    if (token) {
      await callAuthApi("logout", { sessionToken: token });
    }
  } catch (error) {
    // Logout clears the browser session even if the network request fails.
  } finally {
    clearSessionToken();
    currentUser = null;
    setAppBusy(false);
    showLogin();
    showLoginMessage("ออกจากระบบแล้ว", "info");
  }
});

restoreSession();

async function restoreSession() {
  const token = getSessionToken();

  if (!token) {
    showLogin();
    return;
  }

  showAuthLoading();

  try {
    const response = await callAuthApi("getSession", { sessionToken: token });
    const data = requireSuccess(response);

    if (!data.user) {
      throw new Error("BACKEND_RESPONSE_INVALID");
    }

    enterApp(data.user);
  } catch (error) {
    clearSessionToken();
    showLogin();
    showLoginMessage(toThaiErrorMessage(error), "error");
  }
}

function setView(viewName) {
  if (!currentUser) {
    return;
  }

  const view = views[viewName] || views.home;
  activeViewName = views[viewName] ? viewName : "home";
  viewTitle.textContent = view.title;

  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === activeViewName);
  });

  if (activeViewName !== "products") {
    productDom = null;
  }

  contentArea.innerHTML = "";
  contentArea.append(view.render());
}

async function callAuthApi(action, payload) {
  const apiBaseUrl = String(config.API_BASE_URL || "").trim();

  if (config.ENVIRONMENT !== "TEST") {
    throw new Error("CONFIG_NOT_TEST");
  }

  if (!apiBaseUrl) {
    throw new Error("API_URL_MISSING");
  }

  if (/production|prod/i.test(apiBaseUrl)) {
    throw new Error("PRODUCTION_URL_BLOCKED");
  }

  const response = await fetch(apiBaseUrl, {
    method: "POST",
    redirect: "follow",
    credentials: "omit",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ action, payload }),
  });

  if (!response.ok) {
    throw new Error("NETWORK_RESPONSE_NOT_OK");
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error("BACKEND_RESPONSE_INVALID");
  }
}

function requireSuccess(response) {
  if (response && response.success) {
    return response.data || {};
  }

  const error = new Error(response && response.error ? response.error.code : "BACKEND_ERROR");
  error.code = response && response.error ? response.error.code : "BACKEND_ERROR";
  throw error;
}

function enterApp(user) {
  currentUser = user;
  userChip.textContent = user.displayName || user.username || "TEST";
  loginScreen.classList.add("is-hidden");
  authLoading.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  setView("home");
}

function showLogin() {
  currentUser = null;
  appShell.classList.add("is-hidden");
  authLoading.classList.add("is-hidden");
  loginScreen.classList.remove("is-hidden");
}

function showAuthLoading() {
  loginScreen.classList.add("is-hidden");
  appShell.classList.add("is-hidden");
  authLoading.classList.remove("is-hidden");
}

function setLoginLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginButton.textContent = isLoading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ TEST";
}

function setAppBusy(isBusy) {
  logoutButton.disabled = isBusy;
  navItems.forEach((item) => {
    item.disabled = isBusy;
  });
}

function getSessionToken() {
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

function clearSessionToken() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

function showLoginMessage(message, type) {
  loginStatus.textContent = message;
  loginStatus.dataset.type = type || "info";
}

function toThaiErrorMessage(error) {
  const code = error && (error.code || error.message);

  if (code === "API_URL_MISSING") {
    return "ยังไม่ได้ตั้งค่า TEST Backend URL";
  }

  if (code === "CONFIG_NOT_TEST" || code === "PRODUCTION_URL_BLOCKED") {
    return "การตั้งค่า Backend ไม่ใช่ TEST จึงหยุดการเชื่อมต่อ";
  }

  if (code === "INVALID_CREDENTIALS" || code === "VALIDATION_ERROR") {
    return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
  }

  if (code === "AUTH_REQUIRED" || code === "SESSION_EXPIRED") {
    return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
  }

  if (code === "NOT_CONFIGURED") {
    return "ระบบ TEST Backend ยังไม่พร้อมใช้งาน";
  }

  if (code === "BACKEND_RESPONSE_INVALID") {
    return "รูปแบบคำตอบจาก Backend ไม่ถูกต้อง";
  }

  if (code === "NETWORK_RESPONSE_NOT_OK" || error instanceof TypeError) {
    return "เชื่อมต่อ TEST Backend ไม่สำเร็จ กรุณาตรวจสอบเครือข่ายหรือ CORS";
  }

  return "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง";
}

function renderHome() {
  const fragment = document.createDocumentFragment();

  const search = document.createElement("div");
  search.className = "search-box";
  search.textContent = "ค้นหาแบบตัวอย่าง";
  fragment.append(search);

  const shortcuts = document.createElement("section");
  shortcuts.className = "shortcut-grid";
  shortcuts.append(
    createShortcut("รับเข้า", "Placeholder"),
    createShortcut("จ่ายออก", "Placeholder"),
    createShortcut("ตรวจนับ", "Placeholder"),
    createShortcut("รายงาน", "Placeholder"),
  );
  fragment.append(shortcuts);

  const pending = document.createElement("section");
  pending.className = "card";
  pending.innerHTML = `
    <h2>งานรอดำเนินการ</h2>
    <p class="placeholder-text">โครงหน้าจอสำหรับรายการงาน ยังไม่มีข้อมูลจริง</p>
  `;
  fragment.append(pending);

  const summary = document.createElement("section");
  summary.className = "card";
  summary.innerHTML = `
    <h2>สรุปภาพรวม</h2>
    <div class="summary-row" aria-label="ข้อมูลตัวอย่าง">
      <div class="summary-item"><strong>-</strong><span>คำสั่งซื้อ</span></div>
      <div class="summary-item"><strong>-</strong><span>สินค้า</span></div>
      <div class="summary-item"><strong>-</strong><span>สต๊อก</span></div>
    </div>
  `;
  fragment.append(summary);

  return fragment;
}

function renderProductView() {
  const section = document.createElement("section");
  section.className = "product-view";

  const toolbar = document.createElement("section");
  toolbar.className = "product-toolbar";

  const intro = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "รายการสินค้า";
  const detail = document.createElement("p");
  detail.className = "placeholder-text";
  detail.textContent = "ดูสินค้าและ SKU จาก TEST Backend แบบอ่านอย่างเดียว";
  intro.append(title, detail);

  const searchLabel = document.createElement("label");
  searchLabel.className = "product-search-label";
  const searchText = document.createElement("span");
  searchText.textContent = "ค้นหาสินค้า";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "ชื่อสินค้า, SKU, รุ่น, สี, ขนาด";
  searchInput.value = productState.query;
  searchInput.addEventListener("input", (event) => {
    productState.query = event.target.value;
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => {
      loadProducts({ reset: true });
    }, 350);
  });
  searchLabel.append(searchText, searchInput);

  toolbar.append(intro, searchLabel);

  const status = document.createElement("div");
  status.className = "product-status";
  status.setAttribute("aria-live", "polite");

  const list = document.createElement("div");
  list.className = "product-list";

  const loadMoreButton = document.createElement("button");
  loadMoreButton.className = "load-more-button";
  loadMoreButton.type = "button";
  loadMoreButton.textContent = "โหลดเพิ่มเติม";
  loadMoreButton.addEventListener("click", () => {
    if (productState.loading || !productState.hasMore) {
      return;
    }
    productState.page += 1;
    loadProducts({ reset: false });
  });

  const detailPanel = document.createElement("div");
  detailPanel.className = "product-detail-panel";

  productDom = {
    status,
    list,
    loadMoreButton,
    detailPanel,
    searchInput,
  };

  section.append(toolbar, status, list, loadMoreButton, detailPanel);
  updateProductDom();

  if (!productState.initialized) {
    queueMicrotask(() => loadProducts({ reset: true }));
  }

  return section;
}

async function loadProducts(options) {
  const reset = !!(options && options.reset);
  const requestId = productState.requestId + 1;
  productState.requestId = requestId;

  if (reset) {
    productState.page = 1;
    productState.items = [];
    productState.hasMore = false;
    productState.detail = null;
    productState.detailError = "";
  }

  productState.loading = true;
  productState.error = "";
  productState.initialized = true;
  updateProductDom();

  try {
    const token = requireSessionToken();
    const action = productState.query.trim() ? "searchProducts" : "listProducts";
    const payload = {
      sessionToken: token,
      page: productState.page,
      pageSize: PRODUCT_PAGE_SIZE,
    };

    if (action === "searchProducts") {
      payload.query = productState.query.trim();
    }

    const response = await callAuthApi(action, payload);
    const data = requireSuccess(response);

    if (requestId !== productState.requestId) {
      return;
    }

    const nextItems = Array.isArray(data.items) ? data.items : [];
    productState.items = reset ? nextItems : appendUniqueProducts(productState.items, nextItems);
    productState.hasMore = !!data.hasMore;
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }

    if (!reset && productState.page > 1) {
      productState.page -= 1;
    }
    productState.error = toThaiErrorMessage(error);
  } finally {
    if (requestId === productState.requestId) {
      productState.loading = false;
      updateProductDom();
    }
  }
}

async function loadProductDetail(productId) {
  productState.detail = null;
  productState.detailError = "";
  productState.detailLoading = true;
  updateProductDom();

  try {
    const response = await callAuthApi("getProductDetail", {
      sessionToken: requireSessionToken(),
      productId,
    });
    productState.detail = requireSuccess(response);
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }
    productState.detailError = toThaiErrorMessage(error);
  } finally {
    productState.detailLoading = false;
    updateProductDom();
  }
}

function updateProductDom() {
  if (!productDom || activeViewName !== "products") {
    return;
  }

  productDom.status.textContent = "";
  productDom.status.dataset.type = "info";

  clearElement(productDom.list);
  productState.items.forEach((product) => {
    productDom.list.append(createProductCard(product));
  });

  if (productState.loading && productState.items.length === 0) {
    productDom.status.textContent = "กำลังโหลดรายการสินค้า...";
  } else if (productState.error) {
    productDom.status.textContent = productState.error;
    productDom.status.dataset.type = "error";
  } else if (!productState.loading && productState.items.length === 0) {
    productDom.status.textContent = productState.query.trim()
      ? "ไม่พบสินค้าที่ตรงกับคำค้นหา"
      : "ยังไม่มีข้อมูลสินค้า";
  } else if (productState.loading) {
    productDom.status.textContent = "กำลังโหลดเพิ่มเติม...";
  } else {
    productDom.status.textContent = productState.query.trim()
      ? "ผลการค้นหาแบบอ่านอย่างเดียว"
      : "รายการสินค้าจาก TEST Backend";
  }

  productDom.loadMoreButton.hidden = !productState.hasMore;
  productDom.loadMoreButton.disabled = productState.loading;

  renderProductDetailPanel();
}

function createProductCard(product) {
  const article = document.createElement("article");
  article.className = "card product-card";

  const button = document.createElement("button");
  button.className = "product-card-button";
  button.type = "button";
  button.addEventListener("click", () => loadProductDetail(product.productId));

  const header = document.createElement("div");
  header.className = "product-card-header";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = product.productName || "ไม่ระบุชื่อสินค้า";
  const category = document.createElement("p");
  category.className = "placeholder-text";
  category.textContent = product.category || "ไม่ระบุหมวดหมู่";
  titleWrap.append(title, category);

  const status = document.createElement("span");
  status.className = "status-pill";
  status.textContent = product.status || "-";
  header.append(titleWrap, status);

  const summary = document.createElement("div");
  summary.className = "product-meta-grid";
  summary.append(
    createMetric("SKU", product.skuCount || 0),
    createMetric("สถานะ", product.status || "-"),
  );

  const skuList = document.createElement("div");
  skuList.className = "sku-list";
  const skus = Array.isArray(product.skus) ? product.skus : [];
  skus.forEach((sku) => {
    skuList.append(createSkuSummary(sku));
  });

  button.append(header, summary, skuList);
  article.append(button);
  return article;
}

function createMetric(label, value) {
  const item = document.createElement("div");
  item.className = "metric-item";
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const span = document.createElement("span");
  span.textContent = label;
  item.append(strong, span);
  return item;
}

function createSkuSummary(sku) {
  const item = document.createElement("article");
  item.className = "sku-summary";

  const top = document.createElement("div");
  top.className = "sku-summary-top";
  const code = document.createElement("strong");
  code.className = "sku-code";
  code.textContent = sku.skuCode || "-";
  const price = document.createElement("span");
  price.textContent = formatBaht(sku.salePrice);
  top.append(code, price);

  const variant = document.createElement("p");
  variant.className = "placeholder-text";
  variant.textContent = [sku.model, sku.color, sku.size].filter(Boolean).join(" / ") || "ไม่ระบุรายละเอียด SKU";

  const quantities = document.createElement("div");
  quantities.className = "quantity-row";
  quantities.append(
    createQuantityChip("Stock", sku.onHandQty),
    createQuantityChip("หาเพิ่มได้", sku.sourceableQtyEstimate),
  );

  item.append(top, variant, quantities);
  return item;
}

function createQuantityChip(label, value) {
  const chip = document.createElement("span");
  chip.className = label === "Stock" ? "quantity-chip stock" : "quantity-chip sourceable";
  const name = document.createElement("span");
  name.textContent = label;
  const amount = document.createElement("strong");
  amount.textContent = formatNumber(value);
  chip.append(name, amount);
  return chip;
}

function renderProductDetailPanel() {
  clearElement(productDom.detailPanel);

  if (productState.detailLoading) {
    const loading = document.createElement("section");
    loading.className = "card product-detail-card";
    loading.textContent = "กำลังโหลดรายละเอียดสินค้า...";
    productDom.detailPanel.append(loading);
    return;
  }

  if (productState.detailError) {
    const error = document.createElement("section");
    error.className = "card product-detail-card product-error";
    error.textContent = productState.detailError;
    productDom.detailPanel.append(error);
    return;
  }

  if (!productState.detail) {
    return;
  }

  const product = productState.detail;
  const card = document.createElement("section");
  card.className = "card product-detail-card";

  const header = document.createElement("div");
  header.className = "product-detail-header";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = product.productName || "รายละเอียดสินค้า";
  const meta = document.createElement("p");
  meta.className = "placeholder-text";
  meta.textContent = `${product.category || "ไม่ระบุหมวดหมู่"} · ${product.status || "-"}`;
  titleWrap.append(title, meta);

  const close = document.createElement("button");
  close.className = "detail-close-button";
  close.type = "button";
  close.textContent = "กลับ";
  close.addEventListener("click", () => {
    productState.detail = null;
    productState.detailError = "";
    updateProductDom();
  });
  header.append(titleWrap, close);

  const skuList = document.createElement("div");
  skuList.className = "sku-list detail-sku-list";
  (Array.isArray(product.skus) ? product.skus : []).forEach((sku) => {
    skuList.append(createSkuSummary(sku));
  });

  card.append(header, skuList);
  productDom.detailPanel.append(card);
}

function appendUniqueProducts(existingItems, nextItems) {
  const seen = new Set(existingItems.map((item) => item.productId));
  const merged = [...existingItems];
  nextItems.forEach((item) => {
    if (!seen.has(item.productId)) {
      seen.add(item.productId);
      merged.push(item);
    }
  });
  return merged;
}

function requireSessionToken() {
  const token = getSessionToken();
  if (token) {
    return token;
  }

  const error = new Error("AUTH_REQUIRED");
  error.code = "AUTH_REQUIRED";
  throw error;
}

function handleProductAuthFailure(error) {
  const code = error && (error.code || error.message);
  if (code !== "AUTH_REQUIRED" && code !== "SESSION_EXPIRED") {
    return false;
  }

  clearSessionToken();
  currentUser = null;
  showLogin();
  showLoginMessage(toThaiErrorMessage(error), "error");
  return true;
}

function formatBaht(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("th-TH").format(Number(value || 0));
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function createShortcut(title, detail) {
  const item = document.createElement("article");
  item.className = "card shortcut";
  item.innerHTML = `<strong>${title}</strong><span class="placeholder-text">${detail}</span>`;
  return item;
}

function renderPlaceholder(title, detail) {
  const section = document.createElement("section");
  section.className = "card";
  section.innerHTML = `
    <h2>${title}</h2>
    <p class="placeholder-text">${detail}</p>
  `;
  return section;
}
