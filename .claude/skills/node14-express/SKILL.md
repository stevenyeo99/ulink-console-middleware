---
name: node14-express
description: Constraints for this Express API, which runs on Node.js 14. Use when writing or changing code, adding dependencies, or running npm in this project.
---

# Node 14 + Express API

Runtime is **Node 14.17** (the server's nvm version; its npm is 7). Local shell default is newer, so always run through nvm:
`source ~/.nvm/nvm.sh && nvm exec 14.17 npm <cmd>` (`.nvmrc` pins 14.17).
Production runs under the server's **global pm2 5** (`npm run pm2:start|stop|restart|logs`, config in `ecosystem.config.js`).
Never add pm2 as a project dependency: a second pm2 would start its own daemon beside the server's. pm2 6 needs Node 16.
Dev server: `npm run dev` (nodemon 3, watches `src` + `.env`). `nodemon.json` sets `legacyWatch: true` because the repo
is on `/mnt/c`, where inotify misses edits made from Windows editors. Keep it on.

## Language/runtime limits
- CommonJS (`require`/`module.exports`). No ESM, no top-level await.
- Supported: optional chaining `?.`, `??`, async/await, `Promise.allSettled`, `String#matchAll`.
- NOT available: global `fetch`, `structuredClone`, `Array#at`, `Object.hasOwn`, `??=`/`||=`
  (logical assignment needs Node 15), `AbortController` global (15+), `node:` prefix in `require`
  only partially (avoid it), built-in `node:test`.
- For HTTP calls use `http`/`https` stdlib or an installed client pinned to a Node 14 compatible version.

## Dependencies
- Before adding a package, check `engines.node` (`npm view <pkg>@<ver> engines`) allows 14.
- Express must stay on **4.x** (Express 5 needs Node 18+).
- Common traps: `uuid@>=10`, `node-fetch@3` (ESM only), `chalk@5`, `nanoid@4`, `jest@30`, `eslint@9`, `dotenv@17`
  all need newer Node. Pick older majors.
- Many packages declare `>=14.20.1` (the last 14.x). That's above 14.17, so check `engines` against **14.17**, not just "14".

## Express 4 notes
- Rejected promises in async handlers are NOT forwarded to error middleware: wrap with
  `(fn) => (req, res, next) => fn(req, res, next).catch(next)`.
- Error middleware must have 4 args `(err, req, res, next)` and be registered last.
- Verify with `nvm exec 14 npm start` then `curl localhost:$PORT/health`.

## Module layout
Each feature lives in `src/modules/<name>/`:
- `<name>.routes.js`: Express router. Parses and validates req, shapes the HTTP response. Mounted in `src/app.js` under `/api/<name>`.
- `<name>.service.js`: data access only, returns plain objects/streams, no `req`/`res`.
Wrap async handlers with `src/lib/asyncHandler.js`. Parse query params with `src/lib/query.js`
(`parsePaging`, `scanIdFilter` = LIKE '%x%', `barcodeIdFilter`). Don't re-implement validation per route.

## MongoDB (port 23015)
- Server is **MongoDB 4.2**. `mongodb@4.17` supports it.
- 4.2 lacks: `$unionWith`, `$function`/`$accumulator`, `find(...).allowDiskUse()`, `$merge` into same collection (4.4+),
  `$dateAdd`/`$setWindowFields`/`$getField` (5.0+), time-series collections. Use `aggregate(..., { allowDiskUse: true })` for big sorts.
- Available: `$set`/`$unset` stages, `countDocuments`, `estimatedDocumentCount`, transactions (replica set only).
- Driver: **`mongodb@4`** (4.17 supports Node >=12.9 and MongoDB 3.6–7.0; 5.x needs Node 14.20.1). No Mongoose unless asked.
- One shared `MongoClient` in `src/lib/db.js`, connected before `app.listen`, closed on SIGTERM.
  Connection string from env `MONGO_URL` (e.g. `mongodb://127.0.0.1:23015/inslink?directConnection=true&authSource=admin`). Never hardcode credentials.
- Mongo is on AWS, reached in local dev through an SSH tunnel on Windows:
  `ssh -L 0.0.0.0:23015:localhost:23015 aws-ulink-hcbase`. From WSL connect to the Windows host IP
  (`ip route show default | awk '{print $3}'`, currently 172.28.144.1), not 127.0.0.1. Production runs on the server via its local port.
- Through a tunnel use `directConnection=true`, never `replicaSet=...` (replica set discovery switches to AWS-internal hostnames).
- Credentials: read-only user in `.env` (`MONGO_USER`/`MONGO_PASS`, gitignored). Never write them into code or docs.
- `submissions` has NO index on `scanId`. Contains-regex search scans the collection via the `createdAt` index.
- Queries: always project needed fields and cap `limit` (routes cap at 100). Validate ids with `ObjectId.isValid` → 400.
- Materials: `submissions.materials[]` = `fs.files.filename`. `fs.files` holds metadata only (originalname, type, length);
  **`fs.chunks` is empty for these, so the bytes are NOT in GridFS.** Download from the graph service:
  `GRAPH_MATERIAL_URL + material` (no auth, returns image/jpeg). See `src/modules/files/files.graph.js`.
- `POST /api/files/download` takes the `/api/files/materials` response `items` + `outputDownloadPath`, no DB query.
  barcodeId/originalname come from the caller: validate barcodeId, reduce originalname to a safe basename.
- Downloads are written to disk only inside `DOWNLOAD_ROOT` (`.part` then rename). Never let a request path escape it.
- `POST /api/files/download/zip` takes the same `items` + the searched `scanId`; returns `<scanId>.zip` (yazl), no disk.
  Every `items[].scanId` must contain `scanId`.
