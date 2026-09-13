var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/_stub-electron.js
var require_stub_electron = __commonJS({
  "scripts/_stub-electron.js"(exports2, module2) {
    module2.exports = {
      net: { fetch: (...args) => globalThis.fetch(...args) },
      app: { getPath: () => process.cwd(), isPackaged: false },
      ipcMain: { handle: () => {
      } },
      shell: {}
    };
  }
});

// scripts/_stub-store.js
var require_stub_store = __commonJS({
  "scripts/_stub-store.js"(exports2, module2) {
    var Store2 = class {
      constructor() {
        this.data = {};
      }
      get(k, d) {
        return this.data[k] === void 0 ? d : this.data[k];
      }
      set(k, v) {
        this.data[k] = v;
      }
    };
    module2.exports = Store2;
    module2.exports.default = Store2;
  }
});

// src/main/services/GamebananaService.ts
var import_electron2 = __toESM(require_stub_electron());

// src/shared/types.ts
var BALDI_COMMUNITY_CATEGORY_ID = 4609;

// src/main/logger.ts
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));

// src/main/store.ts
var import_electron_store = __toESM(require_stub_store());
var import_electron = __toESM(require_stub_electron());

// src/main/constants.ts
var THEME_DEFAULT = "dark";
var FONT_DEFAULT = "Comic Sans MS";

// src/main/store.ts
var store = new import_electron_store.default({
  defaults: {
    theme: THEME_DEFAULT,
    fontFamily: FONT_DEFAULT,
    splashEnabled: true,
    debugLogging: false,
    navOpen: true
  }
});
function getDebugLogging() {
  return store.get("debugLogging", false);
}

// src/main/logger.ts
var logDir = "";
var logPrefix = "rbbpmm";
function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
function append(level, args) {
  if (getDebugLogging()) {
    console[level === "ERROR" ? "error" : "log"](
      `[${(/* @__PURE__ */ new Date()).toISOString()}] [${level}]`,
      ...args
    );
  }
  if (!logDir) return;
  try {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const body = args.map(
      (a) => typeof a === "string" ? a : a instanceof Error ? a.stack || a.message : safeStringify(a)
    ).join(" ");
    import_fs.default.appendFileSync(import_path.default.join(logDir, `${logPrefix}.log`), `[${ts}] [${level}] ${body}
`);
  } catch {
  }
}
function debugLog(...args) {
  append("DEBUG", args);
}

// src/main/services/GamebananaService.ts
var API_BASE = "https://gamebanana.com/apiv12/";
var PAGE_SIZE = 50;
var USER_AGENT = "GottaManageDev/0.1.0 (mod manager for Baldi's Basics Plus; electron)";
var BLOCKED_MOD_IDS = /* @__PURE__ */ new Set([675111]);
function ok(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asNum(v, fallback = 0) {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}
function asStr(v, fallback = "") {
  return v === void 0 || v === null ? fallback : String(v);
}
function singleImageUrl(img) {
  if (!ok(img)) return void 0;
  const base = asStr(img["_sBaseUrl"]).replace(/\/+$/, "");
  if (!base) return void 0;
  const fileName = asStr(img["_sFile530"]) || asStr(img["_sFile"]) || asStr(img["_sFile100"]);
  return fileName ? `${base}/${fileName}` : void 0;
}
function parseThumb(media) {
  if (!ok(media)) return void 0;
  const images = media["_aImages"];
  if (!Array.isArray(images) || images.length === 0) return void 0;
  return singleImageUrl(images[0]);
}
var REQUEST_TIMEOUT_MS = 2e4;
function timedFetch(url, init, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onAbort = () => ctrl.abort();
    init.signal?.addEventListener("abort", onAbort);
    const cleanup = () => {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onAbort);
    };
    fetch(url, { headers: init.headers, redirect: "follow", signal: ctrl.signal }).then(
      (res) => {
        cleanup();
        resolve(res);
      },
      (err) => {
        cleanup();
        reject(err);
      }
    );
  });
}
function timedNetFetch(url, init, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onAbort = () => ctrl.abort();
    init.signal?.addEventListener("abort", onAbort);
    const cleanup = () => {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onAbort);
    };
    import_electron2.net.fetch(url, { headers: init.headers, redirect: "follow", signal: ctrl.signal }).then(
      (res) => {
        cleanup();
        resolve(res);
      },
      (err) => {
        cleanup();
        reject(err);
      }
    );
  });
}
async function request(url, init) {
  const strategies = [
    () => timedFetch(url, init, REQUEST_TIMEOUT_MS),
    () => timedNetFetch(url, init, REQUEST_TIMEOUT_MS)
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const run of strategies) {
      try {
        const res = await run();
        if (res) return res;
      } catch (err) {
        if (init.signal?.aborted) throw err;
      }
    }
    if (attempt < 1) await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Request failed after retries: ${url}`);
}
async function getJson(url) {
  const res = await request(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error(`GameBanana API ${res.status}: ${res.statusText}`);
  }
  return await res.json();
}
async function searchMods(page, query, category) {
  const q = query ? query.trim() : "";
  const categoryId = category && category > 0 ? category : BALDI_COMMUNITY_CATEGORY_ID;
  const filters = [`_aFilters[Generic_Category]=${categoryId}`];
  if (q) filters.push(`_aFilters[Generic_Name]=contains,${encodeURIComponent(q)}`);
  const url = `${API_BASE}Mod/Index?_nPerpage=${PAGE_SIZE}&${filters.join("&")}&_nPage=${Math.max(1, page)}`;
  debugLog("searchMods url =", url);
  const doc = await getJson(url);
  const records = doc["_aRecords"];
  const items = [];
  if (Array.isArray(records)) {
    for (const r of records) {
      if (!ok(r)) continue;
      const id = asNum(r["_idRow"]);
      if (BLOCKED_MOD_IDS.has(id)) continue;
      const preview = r["_aPreviewMedia"];
      const submitter = ok(r["_aSubmitter"]) ? r["_aSubmitter"] : void 0;
      const category2 = ok(r["_aCategory"]) ? r["_aCategory"] : void 0;
      items.push({
        id,
        name: asStr(r["_sName"]),
        version: asStr(r["_sVersion"]) || void 0,
        authorName: ok(submitter) ? asStr(submitter["_sName"]) || void 0 : void 0,
        hasFiles: r["_bHasFiles"] === true,
        categoryId: category2 ? asNum(category2["_idRow"]) || void 0 : void 0,
        thumbnailUrl: parseThumb(preview),
        viewCount: asNum(r["_nViewCount"]) || void 0,
        dateAdded: asNum(r["_tsDateAdded"]) || void 0,
        dateUpdated: asNum(r["_tsDateModified"]) || asNum(r["_tsDateUpdated"]) || void 0,
        files: []
      });
    }
  }
  await Promise.allSettled(
    items.map(async (it) => {
      try {
        const doc2 = await getJson(API_BASE + "Mod/" + it.id + "/ProfilePage");
        it.downloadCount = asNum(doc2["_nDownloadCount"]) || void 0;
      } catch {
      }
    })
  );
  const meta = ok(doc["_aMetadata"]) ? doc["_aMetadata"] : void 0;
  const recordCount = meta ? asNum(meta["_nRecordCount"]) : items.length;
  return {
    recordCount,
    isComplete: meta ? meta["_bIsComplete"] === true : items.length < PAGE_SIZE,
    perPage: meta ? asNum(meta["_nPerpage"], PAGE_SIZE) : PAGE_SIZE,
    items
  };
}

// scripts/_searchprobe.ts
async function main() {
  const cats = [4609, 28926, 28929];
  for (const cat of cats) {
    const t0 = Date.now();
    try {
      const r = await searchMods(1, void 0, cat);
      console.log(
        `cat=${cat} items=${r.items.length} recordCount=${r.recordCount} perPage=${r.perPage} complete=${r.isComplete} in ${Date.now() - t0}ms`
      );
      console.log(
        "   \u6837\u672C:",
        r.items.slice(0, 4).map((i) => `${i.id}|${i.name}|cat=${i.categoryId}|thumb=${i.thumbnailUrl ? "Y" : "N"}`).join("\n         ")
      );
      const emptyName = r.items.filter((i) => !i.name).length;
      const noId = r.items.filter((i) => !i.id).length;
      console.log(`   name \u4E3A\u7A7A=${emptyName} id \u4E3A\u7A7A=${noId}`);
    } catch (e) {
      console.log(`cat=${cat} \u629B\u9519:`, e instanceof Error ? e.message : String(e));
    }
  }
  const kw = [
    [28929, "school"],
    [28926, "school"]
  ];
  for (const [cat, q] of kw) {
    const t0 = Date.now();
    try {
      const r = await searchMods(1, q, cat);
      console.log(
        `\u5173\u952E\u8BCD cat=${cat} q=${q} items=${r.items.length} recordCount=${r.recordCount} in ${Date.now() - t0}ms`
      );
    } catch (e) {
      console.log(`\u5173\u952E\u8BCD cat=${cat} q=${q} \u629B\u9519:`, e instanceof Error ? e.message : String(e));
    }
  }
}
void main();
