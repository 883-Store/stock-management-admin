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
const STOCK_PAGE_SIZE = 20;
const OWNER_ROLE = "OWNER";

let currentUser = null;
let activeViewName = "home";
let productSearchTimer = null;
let productDom = null;
let stockSearchTimer = null;
let stockDom = null;
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
  detailTransition: "",
  listScrollTop: 0,
  requestId: 0,
};
const stockState = {
  initialized: false,
  query: "",
  page: 1,
  pageSize: STOCK_PAGE_SIZE,
  hasMore: false,
  loading: false,
  error: "",
  items: [],
  detail: null,
  history: [],
  historyLoading: false,
  historyError: "",
  detailTransition: "",
  listScrollTop: 0,
  requestId: 0,
  historyRequestId: 0,
};
const productCreateState = {
  mode: "list",
  form: createEmptyProductForm(),
  errors: [],
  submitting: false,
  message: "",
  messageType: "info",
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

views.stock.render = renderStockView;

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

  if (activeViewName !== "stock") {
    stockDom = null;
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

  const actions = document.createElement("div");
  actions.className = "product-toolbar-actions";
  if (canUseCreateProductUi()) {
    const createButton = document.createElement("button");
    createButton.className = "create-product-entry-button";
    createButton.type = "button";
    createButton.textContent = productCreateState.mode === "list" ? "+ เพิ่มสินค้า" : "กลับรายการ";
    createButton.addEventListener("click", () => {
      if (productCreateState.submitting) {
        return;
      }

      if (productCreateState.mode === "list") {
        productCreateState.message = "";
      }
      productCreateState.mode = productCreateState.mode === "list" ? "form" : "list";
      productCreateState.errors = [];
      rerenderProductView();
    });
    actions.append(createButton);
  }

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

  toolbar.append(intro);
  if (actions.childNodes.length > 0) {
    toolbar.append(actions);
  }

  if (productCreateState.mode !== "list") {
    productDom = null;
    section.append(toolbar, renderCreateProductFlow());
    return section;
  }

  if (productState.detail) {
    productDom = null;
    section.append(renderProductDetailView());
    scheduleProductDetailTopScroll();
    return section;
  }

  toolbar.append(searchLabel);

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

  productDom = {
    status,
    list,
    loadMoreButton,
    searchInput,
  };

  section.append(toolbar, status, list, loadMoreButton);
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

function openProductDetail(product) {
  productState.listScrollTop = getProductScrollTop();
  productState.detail = product;
  productState.detailError = "";
  productState.detailLoading = false;
  productState.detailTransition = "enter";
  rerenderProductView();
}

function renderCreateProductFlow() {
  const wrapper = document.createElement("section");
  wrapper.className = "create-product-flow";

  if (!canUseCreateProductUi()) {
    const denied = document.createElement("section");
    denied.className = "card product-error";
    denied.textContent = "เมนูเพิ่มสินค้าเปิดให้ OWNER ใช้งานใน Phase นี้เท่านั้น";
    wrapper.append(denied);
    return wrapper;
  }

  if (productCreateState.message) {
    const message = document.createElement("p");
    message.className = "product-status create-product-message";
    message.dataset.type = productCreateState.messageType;
    message.textContent = productCreateState.message;
    wrapper.append(message);
  }

  if (productCreateState.errors.length > 0) {
    const errorBox = document.createElement("section");
    errorBox.className = "card create-error-list";
    const title = document.createElement("h2");
    title.textContent = "ตรวจสอบข้อมูล";
    const list = document.createElement("ul");
    productCreateState.errors.forEach((error) => {
      const item = document.createElement("li");
      item.textContent = error;
      list.append(item);
    });
    errorBox.append(title, list);
    wrapper.append(errorBox);
  }

  wrapper.append(productCreateState.mode === "review"
    ? renderCreateProductReview()
    : renderCreateProductForm());
  return wrapper;
}

function renderCreateProductForm() {
  const form = document.createElement("form");
  form.className = "card create-product-form";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    openCreateProductReview();
  });

  const title = document.createElement("h2");
  title.textContent = "เพิ่มสินค้า";
  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = "ระบบจะสร้าง Stock เริ่มต้นเป็น 0 อัตโนมัติ และไม่รับ Opening Balance ในขั้นตอนนี้";
  form.append(title, note);

  form.append(
    createTextField("product_name", "ชื่อสินค้า", productCreateState.form.product_name, true, (value) => {
      productCreateState.form.product_name = value;
    }),
    createTextField("category", "หมวดหมู่", productCreateState.form.category, false, (value) => {
      productCreateState.form.category = value;
    }),
    createTextAreaField("description", "รายละเอียด", productCreateState.form.description, (value) => {
      productCreateState.form.description = value;
    }),
  );

  const skuHeader = document.createElement("div");
  skuHeader.className = "create-section-header";
  const skuTitle = document.createElement("h3");
  skuTitle.textContent = "SKU";
  const addSku = document.createElement("button");
  addSku.type = "button";
  addSku.className = "secondary-action-button";
  addSku.textContent = "+ เพิ่ม SKU";
  addSku.addEventListener("click", () => {
    productCreateState.form.skus.push(createEmptySkuForm());
    productCreateState.errors = [];
    rerenderProductView();
  });
  skuHeader.append(skuTitle, addSku);
  form.append(skuHeader);

  productCreateState.form.skus.forEach((sku, index) => {
    form.append(renderSkuFormCard(sku, index));
  });

  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-action-button";
  cancel.textContent = "ยกเลิก";
  cancel.addEventListener("click", () => {
    resetCreateProductState();
    rerenderProductView();
  });
  const review = document.createElement("button");
  review.type = "submit";
  review.className = "primary-action-button";
  review.textContent = "ตรวจสอบก่อนบันทึก";
  actions.append(cancel, review);
  form.append(actions);

  return form;
}

function renderSkuFormCard(sku, index) {
  const card = document.createElement("section");
  card.className = "sku-form-card";

  const header = document.createElement("div");
  header.className = "sku-form-header";
  const title = document.createElement("h3");
  title.textContent = `SKU #${index + 1}`;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-sku-button";
  remove.textContent = "ลบ";
  remove.disabled = productCreateState.form.skus.length <= 1;
  remove.addEventListener("click", () => {
    if (productCreateState.form.skus.length <= 1) {
      return;
    }
    productCreateState.form.skus.splice(index, 1);
    productCreateState.errors = [];
    rerenderProductView();
  });
  header.append(title, remove);
  card.append(header);

  card.append(
    createTextField(`sku_code_${index}`, "รหัส SKU", sku.sku_code, true, (value) => {
      sku.sku_code = value;
    }),
    createTextField(`model_${index}`, "รุ่น", sku.model, false, (value) => {
      sku.model = value;
    }),
    createTextField(`color_${index}`, "สี", sku.color, false, (value) => {
      sku.color = value;
    }),
    createTextField(`size_${index}`, "ขนาด", sku.size, false, (value) => {
      sku.size = value;
    }),
    createNumberField(`cost_price_${index}`, "ต้นทุน", sku.cost_price, true, "0.01", (value) => {
      sku.cost_price = value;
    }),
    createNumberField(`sale_price_${index}`, "ราคาขาย", sku.sale_price, true, "0.01", (value) => {
      sku.sale_price = value;
    }),
    createNumberField(
      `sourceable_qty_estimate_${index}`,
      "หาเพิ่มได้ประมาณ",
      sku.sourceable_qty_estimate,
      false,
      "1",
      (value) => {
        sku.sourceable_qty_estimate = value;
      },
    ),
  );

  const stockNote = document.createElement("p");
  stockNote.className = "placeholder-text";
  stockNote.textContent = "Stock เริ่มต้น = 0";
  card.append(stockNote);
  return card;
}

function renderCreateProductReview() {
  const review = document.createElement("section");
  review.className = "card create-review-card";

  const title = document.createElement("h2");
  title.textContent = "ยืนยันการเพิ่มสินค้า";
  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = "กรุณาตรวจสอบก่อนบันทึก Stock เริ่มต้นจะเป็น 0 และแก้ไข Stock ไม่ได้ในขั้นตอนนี้";
  review.append(title, note);

  const productSummary = document.createElement("div");
  productSummary.className = "review-summary";
  productSummary.append(
    createReviewLine("ชื่อสินค้า", productCreateState.form.product_name),
    createReviewLine("หมวดหมู่", productCreateState.form.category || "-"),
    createReviewLine("จำนวน SKU", productCreateState.form.skus.length),
  );
  review.append(productSummary);

  const skuList = document.createElement("div");
  skuList.className = "sku-list";
  productCreateState.form.skus.forEach((sku, index) => {
    const card = document.createElement("article");
    card.className = "sku-summary";
    card.append(
      createReviewLine(`SKU #${index + 1}`, normalizeSkuCodeForUi(sku.sku_code)),
      createReviewLine("รุ่น / สี / ขนาด", [sku.model, sku.color, sku.size].filter(Boolean).join(" / ") || "-"),
      createReviewLine("ต้นทุน", formatBaht(sku.cost_price)),
      createReviewLine("ราคาขาย", formatBaht(sku.sale_price)),
      createReviewLine("หาเพิ่มได้ประมาณ", formatNumber(parseSourceableForPayload(sku.sourceable_qty_estimate))),
      createReviewLine("Stock เริ่มต้น", "0"),
    );
    skuList.append(card);
  });
  review.append(skuList);

  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "secondary-action-button";
  back.textContent = "กลับไปแก้ไข";
  back.disabled = productCreateState.submitting;
  back.addEventListener("click", () => {
    productCreateState.mode = "form";
    productCreateState.errors = [];
    rerenderProductView();
  });
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "primary-action-button";
  submit.textContent = productCreateState.submitting ? "กำลังบันทึก..." : "บันทึกสินค้า";
  submit.disabled = productCreateState.submitting;
  submit.addEventListener("click", submitCreateProduct);
  actions.append(back, submit);
  review.append(actions);

  return review;
}

function createTextField(name, label, value, required, onInput) {
  const wrapper = document.createElement("label");
  wrapper.className = "create-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.type = "text";
  input.value = value || "";
  input.required = !!required;
  input.addEventListener("input", (event) => onInput(event.target.value));
  wrapper.append(span, input);
  return wrapper;
}

function createTextAreaField(name, label, value, onInput) {
  const wrapper = document.createElement("label");
  wrapper.className = "create-field";
  const span = document.createElement("span");
  span.textContent = label;
  const textarea = document.createElement("textarea");
  textarea.name = name;
  textarea.value = value || "";
  textarea.addEventListener("input", (event) => onInput(event.target.value));
  wrapper.append(span, textarea);
  return wrapper;
}

function createNumberField(name, label, value, required, step, onInput) {
  const wrapper = document.createElement("label");
  wrapper.className = "create-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.type = "number";
  input.min = "0";
  input.step = step;
  input.value = value || "";
  input.required = !!required;
  input.addEventListener("input", (event) => onInput(event.target.value));
  wrapper.append(span, input);
  return wrapper;
}

function openCreateProductReview() {
  productCreateState.errors = validateCreateProductForm();
  productCreateState.message = "";
  if (productCreateState.errors.length > 0) {
    rerenderProductView();
    return;
  }

  productCreateState.mode = "review";
  rerenderProductView();
}

async function submitCreateProduct() {
  if (productCreateState.submitting) {
    return;
  }

  productCreateState.errors = validateCreateProductForm();
  productCreateState.message = "";
  if (productCreateState.errors.length > 0) {
    productCreateState.mode = "form";
    rerenderProductView();
    return;
  }

  productCreateState.submitting = true;
  rerenderProductView();

  try {
    const response = await callAuthApi("createProduct", {
      sessionToken: requireSessionToken(),
      product: createProductPayloadFromForm(),
    });
    requireSuccess(response);
    resetCreateProductState();
    productCreateState.message = "เพิ่มสินค้าสำเร็จ";
    productCreateState.messageType = "info";
    productState.initialized = false;
    await loadProducts({ reset: true });
    productCreateState.message = "เพิ่มสินค้าสำเร็จ";
    rerenderProductView();
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }
    productCreateState.submitting = false;
    productCreateState.errors = [toCreateProductErrorMessage(error)];
    productCreateState.mode = "form";
    rerenderProductView();
  }
}

function validateCreateProductForm() {
  const errors = [];
  const form = productCreateState.form;
  if (!String(form.product_name || "").trim()) {
    errors.push("กรุณากรอกชื่อสินค้า");
  }

  if (!Array.isArray(form.skus) || form.skus.length < 1) {
    errors.push("ต้องมี SKU อย่างน้อย 1 รายการ");
  }

  const seenSkuCodes = {};
  form.skus.forEach((sku, index) => {
    const label = `SKU #${index + 1}`;
    const skuCode = normalizeSkuCodeForUi(sku.sku_code);
    if (!skuCode) {
      errors.push(`${label}: กรุณากรอกรหัส SKU`);
    } else if (seenSkuCodes[skuCode]) {
      errors.push(`${label}: รหัส SKU ซ้ำในฟอร์ม`);
    }
    seenSkuCodes[skuCode] = true;

    if (!isNonNegativeNumberInput(sku.cost_price)) {
      errors.push(`${label}: ต้นทุนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป`);
    }

    if (!isNonNegativeNumberInput(sku.sale_price)) {
      errors.push(`${label}: ราคาขายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป`);
    }

    if (!isNonNegativeIntegerInput(sku.sourceable_qty_estimate || "0")) {
      errors.push(`${label}: หาเพิ่มได้ประมาณต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป`);
    }
  });

  return errors;
}

function createProductPayloadFromForm() {
  return {
    product_name: String(productCreateState.form.product_name || "").trim(),
    category: String(productCreateState.form.category || "").trim(),
    description: String(productCreateState.form.description || "").trim(),
    skus: productCreateState.form.skus.map((sku) => ({
      sku_code: normalizeSkuCodeForUi(sku.sku_code),
      model: String(sku.model || "").trim(),
      color: String(sku.color || "").trim(),
      size: String(sku.size || "").trim(),
      cost_price: Number(sku.cost_price),
      sale_price: Number(sku.sale_price),
      sourceable_qty_estimate: parseSourceableForPayload(sku.sourceable_qty_estimate),
    })),
  };
}

function createReviewLine(label, value) {
  const row = document.createElement("div");
  row.className = "review-line";
  const key = document.createElement("span");
  key.textContent = label;
  const val = document.createElement("strong");
  val.textContent = String(value || "-");
  row.append(key, val);
  return row;
}

function createEmptyProductForm() {
  return {
    product_name: "",
    category: "",
    description: "",
    skus: [createEmptySkuForm()],
  };
}

function createEmptySkuForm() {
  return {
    sku_code: "",
    model: "",
    color: "",
    size: "",
    cost_price: "",
    sale_price: "",
    sourceable_qty_estimate: "",
  };
}

function resetCreateProductState() {
  productCreateState.mode = "list";
  productCreateState.form = createEmptyProductForm();
  productCreateState.errors = [];
  productCreateState.submitting = false;
  productCreateState.message = "";
  productCreateState.messageType = "info";
}

function rerenderProductView() {
  if (activeViewName === "products" && currentUser) {
    setView("products");
  }
}

function canUseCreateProductUi() {
  return !!currentUser && currentUser.role === OWNER_ROLE;
}

function normalizeSkuCodeForUi(value) {
  return String(value || "").trim().toUpperCase();
}

function isNonNegativeNumberInput(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return false;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function isNonNegativeIntegerInput(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return true;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && Math.floor(parsed) === parsed;
}

function parseSourceableForPayload(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return 0;
  }
  return Number(value);
}

function toCreateProductErrorMessage(error) {
  const code = error && (error.code || error.message);
  if (code === "PERMISSION_DENIED") {
    return "บัญชีนี้ไม่มีสิทธิ์เพิ่มสินค้า";
  }
  if (code === "VALIDATION_ERROR") {
    return "ข้อมูลสินค้าไม่ถูกต้อง กรุณาตรวจสอบรหัส SKU ราคา และข้อมูลที่จำเป็น";
  }
  return toThaiErrorMessage(error);
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

  if (productCreateState.message && !productState.loading && !productState.error) {
    productDom.status.textContent = productCreateState.message;
    productDom.status.dataset.type = productCreateState.messageType;
  } else if (productState.loading && productState.items.length === 0) {
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

}

function createProductCard(product) {
  const article = document.createElement("article");
  article.className = "card product-card";

  const button = document.createElement("button");
  button.className = "product-card-button";
  button.type = "button";
  button.addEventListener("click", () => openProductDetail(product));

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

function renderProductDetailView() {
  const view = document.createElement("section");
  view.className = "product-detail-view";
  if (productState.detailTransition === "exit") {
    view.classList.add("is-exiting");
  }

  if (productState.detailLoading) {
    const loading = document.createElement("section");
    loading.className = "card product-detail-card";
    loading.textContent = "กำลังโหลดรายละเอียดสินค้า...";
    view.append(loading);
    return view;
  }

  if (productState.detailError) {
    const error = document.createElement("section");
    error.className = "card product-detail-card product-error";
    error.textContent = productState.detailError;
    view.append(error);
    return view;
  }

  if (!productState.detail) {
    return view;
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
  close.disabled = productState.detailTransition === "exit";
  close.textContent = "กลับ";
  close.addEventListener("click", closeProductDetail);
  header.append(titleWrap, close);

  const skuList = document.createElement("div");
  skuList.className = "sku-list detail-sku-list";
  (Array.isArray(product.skus) ? product.skus : []).forEach((sku) => {
    skuList.append(createSkuSummary(sku));
  });

  card.append(header, skuList);
  view.append(card);
  return view;
}

function closeProductDetail() {
  if (productState.detailTransition === "exit") {
    return;
  }

  const detailView = document.querySelector(".product-detail-view");
  const finish = () => {
    productState.detail = null;
    productState.detailError = "";
    productState.detailLoading = false;
    productState.detailTransition = "";
    rerenderProductView();
    scheduleProductListScrollRestore();
  };

  if (!detailView || shouldReduceMotion()) {
    finish();
    return;
  }

  productState.detailTransition = "exit";
  detailView.classList.add("is-exiting");
  const backButton = detailView.querySelector(".detail-close-button");
  if (backButton) {
    backButton.disabled = true;
  }
  detailView.addEventListener("animationend", finish, { once: true });
}

function scheduleProductDetailTopScroll() {
  requestAnimationFrame(() => {
    setProductScrollTop(getProductContentTopScroll());
  });
}

function scheduleProductListScrollRestore() {
  requestAnimationFrame(() => {
    setProductScrollTop(productState.listScrollTop);
  });
}

function getProductScrollElement() {
  return document.scrollingElement || document.documentElement;
}

function getProductScrollTop() {
  const scroller = getProductScrollElement();
  return scroller ? scroller.scrollTop : 0;
}

function setProductScrollTop(scrollTop) {
  const scroller = getProductScrollElement();
  if (scroller) {
    scroller.scrollTop = Math.max(0, scrollTop || 0);
  }
}

function getProductContentTopScroll() {
  if (!contentArea) {
    return 0;
  }

  const header = document.querySelector(".app-header");
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  return Math.max(0, contentArea.getBoundingClientRect().top + getProductScrollTop() - headerHeight);
}

function shouldReduceMotion() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

function renderStockView() {
  const section = document.createElement("section");
  section.className = "product-view stock-view";

  const toolbar = document.createElement("section");
  toolbar.className = "product-toolbar stock-toolbar";

  const intro = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "สต๊อก";
  const detail = document.createElement("p");
  detail.className = "placeholder-text";
  detail.textContent = "ดู Stock จริงและประวัติการเคลื่อนไหวจาก TEST Backend แบบอ่านอย่างเดียว";
  intro.append(title, detail);

  const searchLabel = document.createElement("label");
  searchLabel.className = "product-search-label stock-search-label";
  const searchText = document.createElement("span");
  searchText.textContent = "ค้นหา Stock";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "ชื่อสินค้า, SKU, รุ่น, สี, ขนาด";
  searchInput.value = stockState.query;
  searchInput.addEventListener("input", (event) => {
    stockState.query = event.target.value;
    clearTimeout(stockSearchTimer);
    stockSearchTimer = setTimeout(() => {
      loadStock({ reset: true });
    }, 350);
  });
  searchLabel.append(searchText, searchInput);

  toolbar.append(intro);

  if (stockState.detail) {
    stockDom = null;
    section.append(renderStockDetailView());
    scheduleStockDetailTopScroll();
    return section;
  }

  toolbar.append(searchLabel);

  const status = document.createElement("div");
  status.className = "product-status stock-status";
  status.setAttribute("aria-live", "polite");

  const list = document.createElement("div");
  list.className = "product-list stock-list";

  const loadMoreButton = document.createElement("button");
  loadMoreButton.className = "load-more-button";
  loadMoreButton.type = "button";
  loadMoreButton.textContent = "โหลดเพิ่มเติม";
  loadMoreButton.addEventListener("click", () => {
    if (stockState.loading || !stockState.hasMore) {
      return;
    }
    stockState.page += 1;
    loadStock({ reset: false });
  });

  stockDom = {
    status,
    list,
    loadMoreButton,
    searchInput,
  };

  section.append(toolbar, status, list, loadMoreButton);
  updateStockDom();

  if (!stockState.initialized) {
    queueMicrotask(() => loadStock({ reset: true }));
  }

  return section;
}

async function loadStock(options) {
  const reset = !!(options && options.reset);
  const requestId = stockState.requestId + 1;
  stockState.requestId = requestId;

  if (reset) {
    stockState.page = 1;
    stockState.items = [];
    stockState.hasMore = false;
    stockState.detail = null;
    stockState.history = [];
    stockState.historyError = "";
  }

  stockState.loading = true;
  stockState.error = "";
  stockState.initialized = true;
  updateStockDom();

  try {
    const token = requireSessionToken();
    const action = stockState.query.trim() ? "searchStock" : "listStock";
    const payload = {
      sessionToken: token,
      page: stockState.page,
      pageSize: stockState.pageSize,
    };

    if (action === "searchStock") {
      payload.query = stockState.query.trim();
    }

    const response = await callAuthApi(action, payload);
    const data = requireSuccess(response);

    if (requestId !== stockState.requestId) {
      return;
    }

    const nextItems = Array.isArray(data.items) ? data.items : [];
    stockState.items = reset ? nextItems : appendUniqueStockItems(stockState.items, nextItems);
    stockState.hasMore = !!data.hasMore;
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }

    if (!reset && stockState.page > 1) {
      stockState.page -= 1;
    }
    stockState.error = toThaiErrorMessage(error);
  } finally {
    if (requestId === stockState.requestId) {
      stockState.loading = false;
      updateStockDom();
    }
  }
}

function updateStockDom() {
  if (!stockDom || activeViewName !== "stock") {
    return;
  }

  stockDom.status.textContent = "";
  stockDom.status.dataset.type = "info";

  clearElement(stockDom.list);
  stockState.items.forEach((item) => {
    stockDom.list.append(createStockCard(item));
  });

  if (stockState.loading && stockState.items.length === 0) {
    stockDom.status.textContent = stockState.query.trim()
      ? "กำลังค้นหา Stock..."
      : "กำลังโหลด Stock...";
  } else if (stockState.error) {
    stockDom.status.textContent = stockState.error;
    stockDom.status.dataset.type = "error";
  } else if (!stockState.loading && stockState.items.length === 0) {
    stockDom.status.textContent = stockState.query.trim()
      ? "ไม่พบสินค้าที่ตรงกับคำค้นหา"
      : "ยังไม่มีข้อมูล Stock";
  } else if (stockState.loading) {
    stockDom.status.textContent = "กำลังโหลดเพิ่มเติม...";
  } else {
    stockDom.status.textContent = stockState.query.trim()
      ? "ผลการค้นหา Stock แบบอ่านอย่างเดียว"
      : "รายการ Stock จาก TEST Backend";
  }

  stockDom.loadMoreButton.hidden = !stockState.hasMore;
  stockDom.loadMoreButton.disabled = stockState.loading;
}

function createStockCard(item) {
  const article = document.createElement("article");
  article.className = "card product-card stock-card";

  const button = document.createElement("button");
  button.className = "product-card-button stock-card-button";
  button.type = "button";
  button.addEventListener("click", () => openStockDetail(item));

  const header = document.createElement("div");
  header.className = "product-card-header";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = item.skuCode || "-";
  const productName = document.createElement("p");
  productName.className = "placeholder-text";
  productName.textContent = item.productName || "ไม่ระบุชื่อสินค้า";
  titleWrap.append(title, productName);

  const status = document.createElement("span");
  status.className = "status-pill";
  status.textContent = item.status || "-";
  header.append(titleWrap, status);

  const variant = document.createElement("p");
  variant.className = "placeholder-text";
  variant.textContent = formatVariantText(item) || "ไม่ระบุรายละเอียด SKU";

  const quantities = document.createElement("div");
  quantities.className = "quantity-row";
  quantities.append(
    createQuantityChip("Stock", item.onHandQty),
    createQuantityChip("หาเพิ่มได้", item.sourceableQtyEstimate),
  );

  button.append(header, variant, quantities);
  article.append(button);
  return article;
}

function openStockDetail(item) {
  stockState.listScrollTop = getProductScrollTop();
  stockState.detail = item;
  stockState.history = [];
  stockState.historyError = "";
  stockState.historyLoading = true;
  stockState.detailTransition = "enter";
  const requestId = stockState.historyRequestId + 1;
  stockState.historyRequestId = requestId;
  rerenderStockView();
  loadStockHistory(item.skuCode, requestId);
}

async function loadStockHistory(skuCode, requestId) {
  try {
    const response = await callAuthApi("getStockHistory", {
      sessionToken: requireSessionToken(),
      skuCode,
      page: 1,
      pageSize: stockState.pageSize,
    });
    const data = requireSuccess(response);

    if (requestId !== stockState.historyRequestId) {
      return;
    }

    stockState.history = Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }

    stockState.historyError = toThaiErrorMessage(error);
  } finally {
    if (requestId === stockState.historyRequestId) {
      stockState.historyLoading = false;
      rerenderStockView();
    }
  }
}

function renderStockDetailView() {
  const view = document.createElement("section");
  view.className = "product-detail-view stock-detail-view";
  if (stockState.detailTransition === "exit") {
    view.classList.add("is-exiting");
  }

  const item = stockState.detail;
  if (!item) {
    return view;
  }

  const card = document.createElement("section");
  card.className = "card product-detail-card stock-detail-card";

  const header = document.createElement("div");
  header.className = "product-detail-header";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = item.skuCode || "รายละเอียด Stock";
  const meta = document.createElement("p");
  meta.className = "placeholder-text";
  meta.textContent = `${item.productName || "ไม่ระบุชื่อสินค้า"} · ${item.status || "-"}`;
  titleWrap.append(title, meta);

  const close = document.createElement("button");
  close.className = "detail-close-button";
  close.type = "button";
  close.disabled = stockState.detailTransition === "exit";
  close.textContent = "กลับ";
  close.addEventListener("click", closeStockDetail);
  header.append(titleWrap, close);

  const variant = document.createElement("p");
  variant.className = "placeholder-text";
  variant.textContent = formatVariantText(item) || "ไม่ระบุรายละเอียด SKU";

  const quantities = document.createElement("div");
  quantities.className = "quantity-row stock-detail-quantities";
  quantities.append(
    createQuantityChip("Stock", item.onHandQty),
    createQuantityChip("หาเพิ่มได้", item.sourceableQtyEstimate),
  );

  const historyTitle = document.createElement("h3");
  historyTitle.className = "stock-history-title";
  historyTitle.textContent = "ประวัติ Stock";

  const historyBody = renderStockHistoryBody();

  card.append(header, variant, quantities, historyTitle, historyBody);
  view.append(card);
  return view;
}

function renderStockHistoryBody() {
  if (stockState.historyLoading) {
    const loading = document.createElement("p");
    loading.className = "product-status";
    loading.textContent = "กำลังโหลดประวัติ...";
    return loading;
  }

  if (stockState.historyError) {
    const error = document.createElement("p");
    error.className = "product-status product-error";
    error.textContent = stockState.historyError;
    return error;
  }

  if (!stockState.history.length) {
    const empty = document.createElement("p");
    empty.className = "product-status";
    empty.textContent = "ไม่มีประวัติ";
    return empty;
  }

  const list = document.createElement("div");
  list.className = "stock-history-list";
  stockState.history.forEach((transaction) => {
    list.append(createStockHistoryItem(transaction));
  });
  return list;
}

function createStockHistoryItem(transaction) {
  const item = document.createElement("article");
  item.className = "stock-history-item";

  const top = document.createElement("div");
  top.className = "stock-history-top";
  const type = document.createElement("strong");
  type.textContent = stockTransactionLabel(transaction.transactionType);
  const delta = document.createElement("span");
  delta.className = Number(transaction.quantityChange) < 0 ? "stock-delta negative" : "stock-delta";
  delta.textContent = formatSignedNumber(transaction.quantityChange);
  top.append(type, delta);

  const quantity = document.createElement("p");
  quantity.className = "stock-history-quantity";
  quantity.textContent = `${formatNumber(transaction.quantityBefore)} → ${formatNumber(transaction.quantityAfter)}`;

  const reason = document.createElement("p");
  reason.className = "placeholder-text";
  reason.textContent = transaction.reason || "ไม่ระบุเหตุผล";

  const metaParts = [
    formatDateTime(transaction.createdAt),
    stockCreatedByLabel(transaction.createdBy),
    formatReferenceText(transaction),
  ].filter(Boolean);
  const meta = document.createElement("p");
  meta.className = "placeholder-text";
  meta.textContent = metaParts.join(" · ");

  item.append(top, quantity, reason, meta);
  return item;
}

function closeStockDetail() {
  if (stockState.detailTransition === "exit") {
    return;
  }

  const detailView = document.querySelector(".stock-detail-view");
  const finish = () => {
    stockState.detail = null;
    stockState.history = [];
    stockState.historyError = "";
    stockState.historyLoading = false;
    stockState.detailTransition = "";
    rerenderStockView();
    scheduleStockListScrollRestore();
  };

  if (!detailView || shouldReduceMotion()) {
    finish();
    return;
  }

  stockState.detailTransition = "exit";
  detailView.classList.add("is-exiting");
  const backButton = detailView.querySelector(".detail-close-button");
  if (backButton) {
    backButton.disabled = true;
  }
  detailView.addEventListener("animationend", finish, { once: true });
}

function scheduleStockDetailTopScroll() {
  requestAnimationFrame(() => {
    setProductScrollTop(getProductContentTopScroll());
  });
}

function scheduleStockListScrollRestore() {
  requestAnimationFrame(() => {
    setProductScrollTop(stockState.listScrollTop);
  });
}

function rerenderStockView() {
  if (activeViewName === "stock" && currentUser) {
    setView("stock");
  }
}

function appendUniqueStockItems(existingItems, nextItems) {
  const seen = new Set(existingItems.map((item) => normalizeSkuCodeForUi(item.skuCode)));
  const merged = [...existingItems];
  nextItems.forEach((item) => {
    const skuCode = normalizeSkuCodeForUi(item.skuCode);
    if (!seen.has(skuCode)) {
      seen.add(skuCode);
      merged.push(item);
    }
  });
  return merged;
}

function formatVariantText(item) {
  return [item.model, item.color, item.size].filter(Boolean).join(" / ");
}

function stockTransactionLabel(type) {
  if (type === "OPENING_BALANCE") {
    return "ยอดเริ่มต้น";
  }
  if (type === "STOCK_IN") {
    return "รับเข้า";
  }
  if (type === "ADJUSTMENT") {
    return "ปรับยอด";
  }
  return type || "-";
}

function formatSignedNumber(value) {
  const number = Number(value || 0);
  if (number > 0) {
    return `+${formatNumber(number)}`;
  }
  return formatNumber(number);
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function stockCreatedByLabel(value) {
  return value === "AUTHENTICATED_USER" ? "ผู้ใช้ที่ยืนยันตัวตนแล้ว" : "";
}

function formatReferenceText(transaction) {
  const type = String(transaction.referenceType || "").trim();
  const id = String(transaction.referenceId || "").trim();
  if (!type && !id) {
    return "";
  }
  return [type, id].filter(Boolean).join(" ");
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
