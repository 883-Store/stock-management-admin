const STOCK_ADMIN_CONFIG = Object.freeze({
  ENVIRONMENT: "TEST",
  API_BASE_URL: "https://script.google.com/macros/s/AKfycbwJYxD1M-U4nWi3-KJxvHNVwuOPP3D8ou_r3jLrMRxfBD0WE45ugbv-GUrN7d0NcYQx_w/exec",
});

document.documentElement.dataset.stockAdminEnvironment = STOCK_ADMIN_CONFIG.ENVIRONMENT;
document.documentElement.dataset.stockAdminApiBaseUrl = STOCK_ADMIN_CONFIG.API_BASE_URL;
