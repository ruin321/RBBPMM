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

// src/main/services/GamebananaService.ts
var API_BASE = "https://gamebanana.com/apiv12/";
var SITE_BASE = "https://gamebanana.com";
var PAGE_SIZE = 50;
var USER_AGENT = "GottaManageDev/0.1.0 (mod manager for Baldi's Basics Plus; electron)";
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
function absoluteUrl(u) {
  if (!u) return u;
  return u.startsWith("http") ? u : u.startsWith("/") ? SITE_BASE + u : u;
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
function parseUpdate(r) {
  if (!ok(r)) return null;
  if (r["_bIsTrashed"] === true || r["_bIsPrivate"] === true) return null;
  const changeLog = [];
  const rawLog = r["_aChangeLog"];
  if (Array.isArray(rawLog)) {
    for (const entry of rawLog) {
      if (!ok(entry)) continue;
      const text2 = asStr(entry["text"]).trim();
      if (!text2) continue;
      changeLog.push({ text: text2, category: asStr(entry["cat"]).trim() || void 0 });
    }
  }
  const fileNames = [];
  const rawFiles = r["_aFiles"];
  if (Array.isArray(rawFiles)) {
    for (const f of rawFiles) {
      if (!ok(f)) continue;
      const name = asStr(f["_sFile"]).trim();
      if (name && !fileNames.includes(name)) fileNames.push(name);
    }
  }
  const submitter = ok(r["_aSubmitter"]) ? r["_aSubmitter"] : void 0;
  const text = asStr(r["_sText"]).trim();
  return {
    id: asNum(r["_idRow"]),
    title: asStr(r["_sName"]).trim(),
    url: absoluteUrl(asStr(r["_sProfileUrl"])) || void 0,
    dateAdded: asNum(r["_tsDateAdded"]) || void 0,
    version: asStr(r["_sVersion"]).trim() || void 0,
    body: text || void 0,
    authorName: submitter ? asStr(submitter["_sName"]).trim() || void 0 : void 0,
    changeLog,
    fileNames
  };
}
async function getUpdates(submissionId) {
  if (!Number.isFinite(submissionId) || submissionId <= 0) return { total: 0, items: [] };
  try {
    const doc = await getJson(
      `${API_BASE}Mod/${submissionId}/Updates?_nPerpage=${PAGE_SIZE}&_nPage=1`
    );
    const records = doc["_aRecords"];
    const meta = ok(doc["_aMetadata"]) ? doc["_aMetadata"] : void 0;
    const items = [];
    if (Array.isArray(records)) {
      for (const r of records) {
        const u = parseUpdate(r);
        if (u) items.push(u);
      }
    }
    return { total: asNum(meta?.["_nRecordCount"], items.length), items };
  } catch {
    return { total: 0, items: [] };
  }
}

// scripts/_updatesprobe.ts
var IDS = [694067, 716127, 713948];
async function main() {
  for (const id of IDS) {
    const t0 = Date.now();
    const res = await getUpdates(id);
    console.log(`
########## mod ${id} \u2014 total=${res.total} items=${res.items.length} (${Date.now() - t0}ms) ##########`);
    for (const u of res.items) {
      console.log(`  [${u.id}] ${JSON.stringify(u.title)}  ver=${JSON.stringify(u.version)}  date=${u.dateAdded ? new Date(u.dateAdded * 1e3).toISOString().slice(0, 10) : "n/a"}  author=${JSON.stringify(u.authorName)}`);
      console.log(`      url=${u.url}`);
      console.log(`      body=${u.body ? u.body.length + " chars" : "(empty)"}`);
      console.log(`      files=${JSON.stringify(u.fileNames)}`);
      for (const c of u.changeLog) {
        console.log(`      * [${c.category ?? "-"}] ${c.text.slice(0, 90)}`);
      }
    }
  }
  console.log("\n--- \u8FB9\u754C ---");
  for (const bad of [0, -1, Number.NaN]) {
    const r = await getUpdates(bad);
    console.log(`  getUpdates(${String(bad)}) ->`, JSON.stringify(r));
  }
}
void main();
