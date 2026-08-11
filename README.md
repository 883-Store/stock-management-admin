# Stock Management Admin

Mobile-first Inventory Management Web App.

## Stack

- Frontend: GitHub Pages
- Backend: Google Apps Script
- Database: Google Sheets
- File/Image Storage: Google Drive

## Branches

- `test`: development and TEST branch
- `main`: production branch

## Rule

Work must pass TEST before any production change. Do not modify production before TEST PASS.

## TEST Frontend

Open `index.html` in a browser to review the TEST-only app shell.

For real TEST auth integration, set `API_BASE_URL` in `config.js` to the
Google Apps Script TEST Web App URL before testing login from GitHub Pages or a
local browser. Keep this URL pointed at TEST only.

For GitHub Pages TEST deployment, use Deploy from a branch with branch `test`
and folder `/ (root)`.

Product list/search/detail UI uses the authenticated Product Read APIs. Before
runtime testing it from GitHub Pages, deploy a new TEST Apps Script Web App
version that includes the latest Product routing in `backend/Code.gs`.

Create Product UI is TEST-only and currently shown to OWNER accounts only. It
requires a TEST Apps Script Web App deployment that includes the authenticated
`createProduct` route.
