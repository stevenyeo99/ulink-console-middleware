# ulink-console-middleware API

Express API (Node 14.17) that reads claim submissions from MongoDB 4.2 (`inslink`) and downloads material images
from the graph service, either to the server's disk or as a zip file in the response.

- **Base URL:** `http://<host>:<PORT>` (the local `.env` uses `PORT=3023`)
- **Format:** JSON requests and responses (`Content-Type: application/json`)
- **Auth:** none. Deploy behind a private network or a gateway.
- **Times:** ISO 8601 in UTC (`2026-09-23T12:44:16.228Z` = 19:44 at +07:00)

| Method | Path | Purpose |
|---|---|---|
| GET | [`/health`](#get-health) | Liveness check |
| GET | [`/api/barcodes`](#get-apibarcodes) | Barcodes of submissions whose scanId contains a value |
| GET | [`/api/files/materials`](#get-apifilesmaterials) | Materials (images) of submissions, by scanId or barcodeId |
| POST | [`/api/files/download`](#post-apifilesdownload) | Download materials to a folder under `DOWNLOAD_ROOT` |
| POST | [`/api/files/download/zip`](#post-apifilesdownloadzip) | Download materials as a zip file in the response |

See [Workflow: downloading materials](#workflow-downloading-materials) for the end-to-end steps.

---

## Workflow: downloading materials

You start with a scan id, e.g. `API-AYA-CL-26034880`, and end with its images. One scan id can cover several
submissions (`...-01`, `...-02`), and each submission has one barcode and several images (pages).

```
 Caller                                   Middleware                        MongoDB / graph service
   │ 1. GET /api/barcodes?scanId=...  (optional)
   │ ───────────────────────────────────▶ │ find submissions ───────────────▶ MongoDB
   │ ◀─────────── barcodes + full scanIds │
   │
   │ 2. GET /api/files/materials?scanId=...
   │ ───────────────────────────────────▶ │ submissions + image details ────▶ MongoDB
   │ ◀────────── items[] (barcode, images) │
   │
   │ 3. POST /api/files/download/zip   { scanId, items }
   │ ───────────────────────────────────▶ │ fetch each image, one by one ───▶ graph service
   │ ◀──────────────── <scanId>.zip        │
```

### Step 1: Check the scan (optional)
```bash
curl "http://localhost:3023/api/barcodes?scanId=API-AYA-CL-26034880"
```
Lists the barcodes and full scan ids that match. Skip this step if you already know the scan exists; step 2
returns the same submissions.

### Step 2: List the images
```bash
curl "http://localhost:3023/api/files/materials?scanId=API-AYA-CL-26034880" > materials.json
```
- Returns up to 10 submissions per page. If `hasMore` is `true`, fetch the next page with `&skip=10`, `&skip=20`, …
  and download each page separately.
- To download only some images, delete the others from `items[].materials` (or whole `items`) before step 3.
- Use `?barcodeId=VSQ9N14552` instead to get a single submission.

### Step 3: Download
Post the step 2 response back unchanged, adding the `scanId` you searched with:
```bash
node -pe 'JSON.stringify({ ...require("./materials.json"), scanId: "API-AYA-CL-26034880" })' \
  | curl -s -X POST http://localhost:3023/api/files/download/zip \
      -H 'Content-Type: application/json' -d @- -OJ
```
This saves `API-AYA-CL-26034880.zip`. Unzipped:
```
API-AYA-CL-26034880/
├── VSQ9N14552/
│   ├── page-000.jpg
│   └── page-001.jpg
└── VSQ9N14560/
    └── page-000.jpg
```

From a browser app, POST with `fetch`, then `res.blob()`, then an object URL on an `<a download>` link (a plain
link can't send a POST body).

### Step 4: Check the result
| Response | Meaning | What to do |
|---|---|---|
| 200 + zip | At least one image downloaded | Compare the files per barcode with step 2's `materials`. **A failed image is simply missing from the zip.** Retry by posting only the missing materials. |
| 400 | Request is wrong (see `error`) | Fix the body. The common one: `scanId` doesn't appear in every `items[].scanId`. |
| 502 | No image could be downloaded | `items[].results[]` gives the reason per image, e.g. `graph returned HTTP 404`, `graph request timed out`. |

### Limits
- At most **100 images** per request. For more, split the `items` across several requests.
- Images are fetched one at a time (about 0.5 s each), and the zip is sent once all are fetched, so 100 images
  take about 50 s. Set the client timeout to at least 2 minutes.

### Saving on the server instead
For internal jobs that need the files on the server, post the same step 2 response to
[`POST /api/files/download`](#post-apifilesdownload) with `outputDownloadPath` instead of `scanId`. Files land in
`<DOWNLOAD_ROOT>/<outputDownloadPath>/<barcodeId>/`, and the JSON response lists each image's status.

---

## Conventions

### Errors
Every error response has the same shape:
```json
{ "error": "human-readable message" }
```

| Status | When |
|---|---|
| 400 | Invalid or missing parameters, or malformed JSON body |
| 404 | Unknown route |
| 413 | Request body larger than 100 KB |
| 500 | Unexpected server error (message hidden, details in the server log) |

### Paging
List endpoints take `skip` and `limit`, and return `hasMore`:

| Param | Type | Default | Rule |
|---|---|---|---|
| `skip` | integer ≥ 0 | `0` | Number of submissions to skip. Invalid values fall back to the default. |
| `limit` | integer ≥ 1 | per endpoint | Capped at the endpoint's max. Invalid values fall back to the default; `0` is treated as `1`. |

`hasMore: true` means another page exists: request again with `skip = skip + limit`. There is no total count.

### Identifier rules
| Field | Rule |
|---|---|
| `scanId` | 3–64 characters: letters, digits, `_`, `-`. Matched as a **contains** search (SQL `LIKE '%value%'`), case-sensitive. |
| `barcodeId` | 1–32 letters or digits. Exact match. |
| `material` | 16–128 letters or digits (real ids are 64 characters). |

Parameters are trimmed. Values that are not plain strings (e.g. `?scanId[$ne]=x`) are rejected with 400.

---

## GET /health

Returns 200 while the server is running. It doesn't check MongoDB; the server refuses to start if MongoDB is unreachable.

```bash
curl http://localhost:3023/health
```
```json
{ "status": "ok" }
```

---

## GET /api/barcodes

Barcodes of the submissions whose `scanId` contains the given value, newest first (`createdAt` descending).

### Query parameters
| Name | Required | Description |
|---|---|---|
| `scanId` | yes | Text to search for inside `scanId`, e.g. `26034880` or `API-AYA-CL-26034880-01` |
| `skip` | no | Default `0` |
| `limit` | no | Default `20`, max `100` |

### Response 200
| Field | Type | Description |
|---|---|---|
| `items[].barcodeId` | string | Submission barcode |
| `items[].scanId` | string | Full scan id |
| `items[].createdAt` | string (date-time) | Submission creation time |
| `hasMore` | boolean | More results after this page |

```bash
curl "http://localhost:3023/api/barcodes?scanId=26034880"
```
```json
{
  "items": [
    { "barcodeId": "VSQ9N14552", "createdAt": "2026-09-23T12:44:16.228Z", "scanId": "API-AYA-CL-26034880-01" }
  ],
  "hasMore": false
}
```
No match returns `{ "items": [], "hasMore": false }` (200, not 404).

### Errors
| Status | `error` |
|---|---|
| 400 | `scanId must be 3-64 chars of letters, digits, _ or -` |

> **Performance:** `submissions.scanId` has no index, so a search that matches nothing reads the whole
> collection (~330k documents). An index on `{ scanId: 1 }` would make this faster.

---

## GET /api/files/materials

Submissions and their materials (image files), newest first. Pass **exactly one** of `scanId` or `barcodeId`.
Image details come from `fs.files` (matched by `filename` = material id).

### Query parameters
| Name | Required | Description |
|---|---|---|
| `scanId` | one of | Contains-search on `scanId` (can match several submissions) |
| `barcodeId` | one of | Exact barcode (at most one submission) |
| `skip` | no | Default `0` (counts submissions, not materials) |
| `limit` | no | Default `10`, max `50` (submissions per page) |

### Response 200
| Field | Type | Description |
|---|---|---|
| `items[].barcodeId` | string | Submission barcode |
| `items[].scanId` | string | Full scan id |
| `items[].createdAt` | string (date-time) | Submission creation time |
| `items[].materials[].material` | string | Material id (use it in the download API) |
| `items[].materials[].originalname` | string | Original file name, e.g. `page-000.jpg` |
| `items[].materials[].contentType` | string | MIME type, e.g. `image/jpeg` |
| `items[].materials[].length` | integer | Size in bytes |
| `items[].materials[].uploadDate` | string (date-time) | Upload time |
| `items[].materials[].missing` | boolean | Only present (`true`) when `fs.files` has no record for this material; the other fields except `material` are then absent |
| `hasMore` | boolean | More submissions after this page |

Materials keep the order stored in the submission.

```bash
curl "http://localhost:3023/api/files/materials?scanId=26034880"
curl "http://localhost:3023/api/files/materials?barcodeId=VSQ9N14552"
```
```json
{
  "items": [
    {
      "barcodeId": "VSQ9N14552",
      "scanId": "API-AYA-CL-26034880-01",
      "createdAt": "2026-09-23T12:44:16.228Z",
      "materials": [
        {
          "material": "ec4Uw5yawSHi0a6u1sErWzaYeXmI0erDt1puf1VLIpDtaPgWQNbKHxqpj15PqXo5",
          "originalname": "page-000.jpg",
          "contentType": "image/jpeg",
          "length": 121719,
          "uploadDate": "2026-09-23T12:44:15.544Z"
        },
        {
          "material": "qOYLs9vguVEYpPaH4AgmmokseKUtk1pbeA9eVh8PZ8laePXGJtddbkhjgc2q3pHj",
          "originalname": "page-001.jpg",
          "contentType": "image/jpeg",
          "length": 93556,
          "uploadDate": "2026-09-23T12:44:15.651Z"
        }
      ]
    }
  ],
  "hasMore": false
}
```
(The real response for this barcode lists 7 materials, `page-000.jpg` to `page-006.jpg`.)

### Errors
| Status | `error` |
|---|---|
| 400 | `Provide exactly one of scanId or barcodeId` |
| 400 | `scanId must be 3-64 chars of letters, digits, _ or -` |
| 400 | `barcodeId must be 1-32 letters or digits` |

---

## POST /api/files/download

Downloads material images from the graph service (`GRAPH_MATERIAL_URL` + material id) and saves them on the
**server** at:

```
<DOWNLOAD_ROOT>/<outputDownloadPath>/<barcodeId>/<originalname>
```

The request body is the `/api/files/materials` response plus `outputDownloadPath`. The API does not query MongoDB.
To download only some images, remove the others from `materials` before posting.

### Request body
| Field | Type | Required | Description |
|---|---|---|---|
| `outputDownloadPath` | string | yes | Folder relative to `DOWNLOAD_ROOT` (an absolute path is accepted only if it's inside `DOWNLOAD_ROOT`). Created if missing. |
| `items` | array | yes | At least 1 item |
| `items[].barcodeId` | string | yes | Used as the sub-folder name. Must pass the `barcodeId` rule. |
| `items[].materials` | array | yes | At least 1 material per item |
| `items[].materials[].material` | string | yes | Material id |
| `items[].materials[].originalname` | string | no | File name to save as. Defaults to the material id. |

- **Limit:** at most **100 materials** in total across all items.
- **Ignored fields:** `scanId`, `createdAt`, `contentType`, `length`, `uploadDate`, `missing`, `hasMore`, and any others.
- **Duplicates:** a material listed twice in the same item is downloaded once.

```bash
curl -X POST http://localhost:3023/api/files/download \
  -H 'Content-Type: application/json' \
  -d '{
    "items": [
      {
        "barcodeId": "VSQ9N14552",
        "materials": [
          { "material": "ec4Uw5yawSHi0a6u1sErWzaYeXmI0erDt1puf1VLIpDtaPgWQNbKHxqpj15PqXo5", "originalname": "page-000.jpg" },
          { "material": "qOYLs9vguVEYpPaH4AgmmokseKUtk1pbeA9eVh8PZ8laePXGJtddbkhjgc2q3pHj", "originalname": "page-001.jpg" }
        ]
      }
    ],
    "outputDownloadPath": "batch-01"
  }'
```

Chaining the two calls (list, then download everything listed):
```bash
curl -s "http://localhost:3023/api/files/materials?scanId=26034880" \
  | node -pe 'JSON.stringify({ ...JSON.parse(require("fs").readFileSync(0)), outputDownloadPath: "batch-01" })' \
  | curl -s -X POST http://localhost:3023/api/files/download -H 'Content-Type: application/json' -d @-
```

### Response 200
Returned when the request is valid, even if some or all downloads failed. Check each `status`.

| Field | Type | Description |
|---|---|---|
| `items[].barcodeId` | string | Barcode from the request |
| `items[].outputDir` | string | Absolute folder the files were written to |
| `items[].results[].material` | string | Material id |
| `items[].results[].status` | `"saved"` \| `"failed"` | Outcome for this material |
| `items[].results[].file` | string | Absolute path of the saved file (`saved` only) |
| `items[].results[].bytes` | integer | Size written (`saved` only) |
| `items[].results[].error` | string | Reason (`failed` only), e.g. `graph returned HTTP 404`, `graph request timed out` |

```json
{
  "items": [
    {
      "barcodeId": "VSQ9N14552",
      "outputDir": "/mnt/c/client/ulink/console/downloads/IN/batch-01/VSQ9N14552",
      "results": [
        {
          "material": "ec4Uw5yawSHi0a6u1sErWzaYeXmI0erDt1puf1VLIpDtaPgWQNbKHxqpj15PqXo5",
          "status": "saved",
          "file": "/mnt/c/client/ulink/console/downloads/IN/batch-01/VSQ9N14552/page-000.jpg",
          "bytes": 121719
        },
        {
          "material": "AAAAAAAAAAAAAAAAAAAAAAAA",
          "status": "failed",
          "error": "graph returned HTTP 404"
        }
      ]
    }
  ]
}
```

### Behaviour
- **Overwrite:** existing files with the same name are replaced.
- **No partial files:** each image is written to `<name>.part` and renamed when complete. A failed download leaves nothing behind.
- **Failures don't stop the batch:** each material is attempted even if earlier ones fail.
- **Order and timing:** downloads run one at a time. Each graph request times out after 30 s. The response is sent when all downloads have finished (about 0.5 s per image).
- **File names:** `originalname` is reduced to a plain file name:
  - folder parts are removed (`../../x.jpg` → `x.jpg`)
  - characters other than letters, digits, `.`, `_`, `-` become `_`
  - an empty name, `.` or `..` falls back to the material id
  - if two materials in one item end up with the same name, the second is saved as `<material>-<name>`
- **Trust:** `barcodeId` and `originalname` are taken from the request and not checked against MongoDB. A wrong `barcodeId` puts the images in the wrong folder, but never outside `DOWNLOAD_ROOT`.

### Errors
| Status | `error` |
|---|---|
| 400 | `items must be the /materials response items: [{ barcodeId, materials: [{ material, originalname }] }]` (missing or empty `items`/`materials`, invalid `barcodeId` or `material`, or `materials` given as plain strings) |
| 400 | `At most 100 materials per request (got N)` |
| 400 | `outputDownloadPath must be inside DOWNLOAD_ROOT` (missing, or resolves outside it, e.g. `../x` or `/tmp`) |

---

## POST /api/files/download/zip

Same as [`/api/files/download`](#post-apifilesdownload), but the images are returned as **one zip file** in the
response instead of being saved on the server. Nothing is written to disk.

The request body is the `/api/files/materials?scanId=...` response plus the `scanId` you searched with. That
`scanId` names the zip and its top folder:

```
API-AYA-CL-26034880.zip
└── API-AYA-CL-26034880/
    ├── VSQ9N14552/          (submission API-AYA-CL-26034880-01)
    │   ├── page-000.jpg
    │   └── page-001.jpg
    └── VSQ9N14560/          (submission API-AYA-CL-26034880-02)
        └── page-000.jpg
```

### Request body
| Field | Type | Required | Description |
|---|---|---|---|
| `scanId` | string | yes | The scanId searched with, e.g. `API-AYA-CL-26034880`. 3-64 letters, digits, `_` or `-`. |
| `items[].scanId` | string | yes | Full scanId from the materials response. Must **contain** `scanId`. |
| `items`, `items[].barcodeId`, `items[].materials[]...` | | | Same as `/api/files/download` (same 100-material limit, duplicates, file names) |

```bash
curl -s "http://localhost:3023/api/files/materials?scanId=API-AYA-CL-26034880" \
  | node -pe 'JSON.stringify({ ...JSON.parse(require("fs").readFileSync(0)), scanId: "API-AYA-CL-26034880" })' \
  | curl -s -X POST http://localhost:3023/api/files/download/zip -H 'Content-Type: application/json' -d @- -OJ
```
(`-OJ` saves it as `API-AYA-CL-26034880.zip`.) From a browser, POST with `fetch`, then `res.blob()`, then an
object URL on an `<a download>`.

### Response 200
`Content-Type: application/zip`, `Content-Disposition: attachment; filename="<scanId>.zip"`.

Sent when at least one image was downloaded. Failed images are left out of the zip without notice; compare the
zip against the materials you posted if you need every page.

### Response 502
Every image failed. The body lists the reason per image:
```json
{
  "error": "No materials could be downloaded",
  "items": [
    { "barcodeId": "VSQ9N14552", "results": [ { "material": "AAAAAAAAAAAAAAAAAAAAAAAA", "status": "failed", "error": "graph returned HTTP 404" } ] }
  ]
}
```

### Behaviour
- **Timing:** all images are downloaded (one at a time, as with `/download`) before the zip is sent, so the
  response starts after about 0.5 s per image.
- **Images are stored uncompressed** in the zip; JPEGs don't shrink further.
- **Trust:** `scanId`, `barcodeId` and `originalname` come from the request and are not checked against MongoDB.

### Errors
| Status | `error` |
|---|---|
| 400 | `scanId must be 3-64 chars of letters, digits, _ or -` |
| 400 | `items[].scanId must contain <scanId> (barcode <barcodeId> does not)` |
| 400 | Same `items` and limit errors as `/api/files/download` |
| 502 | `No materials could be downloaded`, with the per-material results in `items` |

---

## Configuration (`.env`)

| Variable | Required | Example | Description |
|---|---|---|---|
| `PORT` | no | `3023` | HTTP port (default `3000`) |
| `MONGO_URL` | yes | `mongodb://127.0.0.1:23015/inslink?directConnection=true&authSource=admin` | Connection string; the database name is taken from the path |
| `MONGO_USER` | yes | `airead` | Read-only MongoDB user |
| `MONGO_PASS` | yes | | Its password |
| `GRAPH_MATERIAL_URL` | yes | `https://iasconsole-graph.ulinkmyanmar.com.mm/claim/material/` | Prefix; the material id is appended |
| `DOWNLOAD_ROOT` | yes | `/mnt/c/client/ulink/console/downloads/IN` | Every download is written inside this folder |

The server exits at startup if `MONGO_URL`, `GRAPH_MATERIAL_URL` or `DOWNLOAD_ROOT` is missing, or if MongoDB
can't be reached.

## Running

| Command | Use |
|---|---|
| `npm run dev` | Local development with nodemon; restarts on changes in `src/` and `.env` |
| `npm start` | Run once in the foreground |
| `npm run pm2:start` / `pm2:restart` / `pm2:stop` / `pm2:logs` | Server, using the global pm2 5 on Node 14.17 |
