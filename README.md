# ulink-console-middleware

A small read-only API for getting claim submission images (materials) out of the ULINK console system. You give it
a scan id; it finds the matching claim submissions in MongoDB and downloads their page images from the graph
service, either as a zip file in the response or into a folder on the server.

## Purpose

Claim documents are scanned and submitted into the console system (`inslink` database). Each submission has a
barcode, a scan id (e.g. `API-AYA-CL-26034880-01`) and a list of material ids, one per scanned page. The image
bytes are not in MongoDB; they are served by the graph service, one URL per material.

This middleware joins the two so a caller can get a scan's images in three steps:

1. **Find** the submissions for a scan id (`GET /api/barcodes`)
2. **List** their images (`GET /api/files/materials`)
3. **Download** them as `<scanId>.zip` (`POST /api/files/download/zip`), or save them on the server
   (`POST /api/files/download`)

It is used by the ULINK console and by third parties who need a scan's pages. It never writes to MongoDB.

Full endpoint reference and the end-to-end download workflow: [docs/samples/API.md](docs/samples/API.md).

## How it fits together

```
 Caller ──HTTP──▶ ulink-console-middleware ──read-only──▶ MongoDB 4.2 (inslink: submissions, fs.files)
                                          └──HTTPS─────▶ graph service (GRAPH_MATERIAL_URL + material id → image)
```

## Requirements

| What | Version / note |
|---|---|
| Node.js | 14.17 (pinned in `.nvmrc`; `package.json` allows `>=14 <15`) |
| npm | the one bundled with Node 14 is fine for `npm ci`; the lockfile is version 2 |
| MongoDB | 4.2, reachable from this machine, with a **read-only** user |
| Graph service | HTTPS access to `GRAPH_MATERIAL_URL` (no auth) |
| pm2 | 5, installed globally, for running as a server (optional for development) |

## Setup

```bash
cd ulink-console-middleware
nvm use                      # switches to Node 14.17 from .nvmrc
npm ci                       # install exact versions from package-lock.json
cp .env.example .env         # then fill in the values below
```

### Configuration (`.env`)

| Variable | Required | Example | Description |
|---|---|---|---|
| `PORT` | no | `3023` | HTTP port (default `3000`) |
| `MONGO_URL` | yes | `mongodb://127.0.0.1:23015/inslink?directConnection=true&authSource=admin` | Connection string; the database name comes from the path |
| `MONGO_USER` | yes | | Read-only MongoDB user |
| `MONGO_PASS` | yes | | Its password |
| `GRAPH_MATERIAL_URL` | yes | `https://iasconsole-graph.ulinkmyanmar.com.mm/claim/material/` | Prefix; the material id is appended |
| `DOWNLOAD_ROOT` | yes | `/mnt/c/client/ulink/console/downloads/IN` | Folder for `POST /api/files/download`; nothing is written outside it |

- `.env` is gitignored. Never commit credentials or copy them into code or docs.
- **WSL:** if MongoDB runs on the Windows host, `127.0.0.1` may not reach it from WSL. Use the Windows host IP
  instead (e.g. `172.28.144.1`).
- The server exits at startup if `MONGO_URL`, `GRAPH_MATERIAL_URL` or `DOWNLOAD_ROOT` is missing, or if MongoDB
  can't be reached.

## Running

| Command | Use |
|---|---|
| `npm run dev` | Development with nodemon; restarts on changes in `src/` and `.env` |
| `npm start` | Run once in the foreground |
| `npm run pm2:start` / `pm2:restart` / `pm2:stop` / `pm2:logs` | Run as a server under pm2 (`ecosystem.config.js`) |

Check it's up:

```bash
curl http://localhost:3023/health          # {"status":"ok"}
```

Try the full flow:

```bash
curl "http://localhost:3023/api/files/materials?scanId=API-AYA-CL-26034880" > materials.json
node -pe 'JSON.stringify({ ...require("./materials.json"), scanId: "API-AYA-CL-26034880" })' \
  | curl -s -X POST http://localhost:3023/api/files/download/zip \
      -H 'Content-Type: application/json' -d @- -OJ     # saves API-AYA-CL-26034880.zip
```

## Project structure

```
src/
├── server.js                 checks env, connects to MongoDB, starts HTTP, shuts down cleanly
├── app.js                    Express app: routes, 404, error handler
├── lib/
│   ├── db.js                 MongoDB client (database from MONGO_URL)
│   ├── query.js              query-string parsing and id validation (scanId, barcodeId, paging)
│   └── asyncHandler.js       forwards async route errors to the error handler
└── modules/
    ├── barcodes/             GET /api/barcodes
    └── files/
        ├── files.routes.js   GET /materials, POST /download, POST /download/zip (request validation)
        ├── files.service.js  MongoDB lookups, save-to-disk and zip building
        └── files.graph.js    fetches material images from the graph service
docs/samples/
├── API.md                    endpoint reference and download workflow
└── mongodb/                  sample submission documents
```

## Things to know

- **No auth.** Run it on a private network or behind a gateway.
- **Read-only.** It only reads `submissions` and `fs.files`. Image bytes always come from the graph service
  (`fs.chunks` is empty for these files).
- **Slow scanId search.** `submissions.scanId` has no index, so a scanId search scans the collection
  (~330k documents). An index on `{ scanId: 1 }` would fix it.
- **Download limits.** At most 100 images per download request, fetched one at a time (about 0.5 s each).
