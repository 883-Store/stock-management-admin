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

let currentUser = null;

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
    render: () => renderPlaceholder("สินค้า", "พื้นที่ตัวอย่างสำหรับเมนูสินค้า ยังไม่สร้าง Product หรือ SKU"),
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
  viewTitle.textContent = view.title;

  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === viewName);
  });

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
