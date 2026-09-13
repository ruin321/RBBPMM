var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/main/services/ModRepositoryScanner.ts
var import_fs3 = __toESM(require("fs"));
var import_path4 = __toESM(require("path"));

// src/main/constants.ts
var import_path = __toESM(require("path"));
var BEPINEX_FOLDER = "BepInEx";
var PLUGINS_FOLDER = "plugins";
var GMP_METADATA_FOLDER = ".rbbpmm";
var GMP_FALLBACK_METADATA_FOLDER = "_rbbpmm";
var MANIFEST_FILE = "manifest.json";
var METADATA_FILE = ".metadata";
var DISABLED_EXTENSION = "disabled";
var SUPPORTED_VERSION_PREFIX = "supVer_";
function bepinexPluginsDir(gameRoot) {
  return import_path.default.join(gameRoot, BEPINEX_FOLDER, PLUGINS_FOLDER);
}

// src/main/services/ManifestLoader.ts
var import_fs = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
function pickMetadataFolder(modRoot) {
  for (const f of [GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER]) {
    const p = import_path2.default.join(modRoot, f);
    if (import_fs.default.existsSync(p)) return p;
  }
  return null;
}
function loadModManifest(modRoot, gameVersion) {
  const metaFolder = pickMetadataFolder(modRoot);
  if (!metaFolder) return null;
  const manifestPath = import_path2.default.join(metaFolder, MANIFEST_FILE);
  if (!import_fs.default.existsSync(manifestPath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(import_fs.default.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
  if (!manifest?.guid || !manifest?.name || !manifest?.author || manifest?.version === void 0) {
    return null;
  }
  manifest.plugins = manifest.plugins || [];
  manifest.patchers = manifest.patchers || [];
  manifest.assets = manifest.assets || [];
  return manifest;
}
function loadMetadata(modRoot, manifest) {
  const metaFolder = pickMetadataFolder(modRoot);
  const defaults = { activated: true, supportedPlusVersions: [] };
  if (!metaFolder) return defaults;
  const metaPath = import_path2.default.join(metaFolder, METADATA_FILE);
  if (!import_fs.default.existsSync(metaPath)) return defaults;
  try {
    const raw = JSON.parse(import_fs.default.readFileSync(metaPath, "utf-8"));
    return {
      activated: raw.activated !== void 0 ? !!raw.activated : true,
      supportedPlusVersions: raw.supportedPlusVersions || [],
      lastUpdateDate: raw.lastUpdateDate,
      installationUrl: raw.installationUrl,
      thumbnail: raw.thumbnail,
      path: raw.path,
      gamebananaSource: raw.gamebananaSource,
      lastInstalledArchiveName: raw.lastInstalledArchiveName
    };
  } catch {
    return defaults;
  }
}
function matchSupportedVersion(modRoot, gameVersion) {
  if (!gameVersion) return true;
  const metaFolder = pickMetadataFolder(modRoot);
  if (!metaFolder) return false;
  let versions = [];
  try {
    for (const f of import_fs.default.readdirSync(metaFolder)) {
      if (f.startsWith(SUPPORTED_VERSION_PREFIX)) {
        const rest = f.slice(SUPPORTED_VERSION_PREFIX.length);
        versions.push(...rest.split("_").filter(Boolean));
      }
    }
  } catch {
    return false;
  }
  if (versions.length === 0) return true;
  return versions.includes(gameVersion);
}

// src/main/services/PluginGuid.ts
var import_fs2 = __toESM(require("fs"));
var import_path3 = __toESM(require("path"));
var TOKEN_RE = /[A-Za-z][A-Za-z0-9_]{1,40}(?:\.[A-Za-z][A-Za-z0-9_]{0,40}){2,6}/g;
var UTF16_RUN_RE = /(?:[A-Za-z0-9_.]\x00){3,}/g;
var STOP_SEGMENTS = /* @__PURE__ */ new Set([
  "system",
  "unity",
  "unityengine",
  "microsoft",
  "mscorlib",
  "mono",
  "monomod",
  "newtonsoft",
  "bepinex",
  "csharp",
  "assembly",
  "js",
  "native",
  "dotnet"
]);
var STOP_TAIL = /\.(patches|ui|optionsapi|assettools|configuration|logging|bootstrap|api|tool|editor|handler|objectpool|extensions|manager|debug|state|core)$/i;
var STOP_MID = /* @__PURE__ */ new Set([
  "ui",
  "editor",
  "tools",
  "extensions",
  "handlers",
  "objectpool",
  "manager",
  "debug",
  "state",
  "core",
  "patches",
  "api"
]);
function scanTokens(text) {
  const ascii = text.match(TOKEN_RE) || [];
  const utf16 = (text.match(UTF16_RUN_RE) || []).map((run) => run.replace(/\x00/g, ""));
  const plausible = (raw) => {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const rawTok of raw) {
      const segs = rawTok.split(".").filter(Boolean);
      const len = segs.length;
      if (len < 3 || len > 7) continue;
      if (segs.some((s) => STOP_SEGMENTS.has(s.toLowerCase()))) continue;
      if (segs.some((s) => /^\d+$/.test(s))) continue;
      const tok = segs.join(".");
      if (seen.has(tok)) continue;
      if (STOP_TAIL.test(tok)) continue;
      const mid = segs.slice(1, -1).map((s) => s.toLowerCase());
      if (mid.some((s) => STOP_MID.has(s))) continue;
      seen.add(tok);
      out.push(tok);
    }
    return out;
  };
  const utf = plausible(utf16).sort((a, b) => a.split(".").length - b.split(".").length);
  const asciiOut = plausible(ascii).sort((a, b) => a.split(".").length - b.split(".").length).filter((a) => !utf.includes(a));
  return { utf16: utf, ascii: asciiOut };
}
var CANDIDATE_CACHE = /* @__PURE__ */ new Map();
var CANDIDATE_CACHE_MAX = 1024;
function cacheKeyFor(dllPath) {
  try {
    const st = import_fs2.default.statSync(dllPath);
    if (!st.isFile()) return null;
    const dir = import_path3.default.dirname(dllPath).toLowerCase();
    return `${dir}\0${import_path3.default.basename(dllPath).toLowerCase()}\0${st.size}\0${st.mtimeMs}`;
  } catch {
    return null;
  }
}
function computeCandidates(dllPath) {
  let text;
  try {
    text = import_fs2.default.readFileSync(dllPath).toString("latin1");
  } catch {
    return [];
  }
  const { utf16, ascii } = scanTokens(text);
  return [...utf16, ...ascii];
}
function extractPluginCandidates(dllPath) {
  if (!import_fs2.default.existsSync(dllPath)) return [];
  const key = cacheKeyFor(dllPath);
  if (!key) return [];
  const cached = CANDIDATE_CACHE.get(key);
  if (cached) return cached.slice();
  const value = computeCandidates(dllPath);
  if (CANDIDATE_CACHE.size >= CANDIDATE_CACHE_MAX) {
    const oldest = CANDIDATE_CACHE.keys().next().value;
    if (oldest !== void 0) CANDIDATE_CACHE.delete(oldest);
  }
  CANDIDATE_CACHE.set(key, value);
  return value.slice();
}

// src/main/services/ModGuidTable.ts
var MOD_GUID_OVERRIDES = {};

// src/main/services/ModRepositoryScanner.ts
function moddedRoot(gameRoot) {
  return import_path4.default.join(gameRoot, "BALDI_Data", "StreamingAssets", "Modded");
}
function dirInstalledAt(abs) {
  try {
    let newest = 0;
    const walk = (dir) => {
      let entries;
      try {
        entries = import_fs3.default.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = import_path4.default.join(dir, e.name);
        if (e.isDirectory()) {
          walk(p);
        } else if (/\.(dll|pdb)$/i.test(e.name)) {
          try {
            const m = import_fs3.default.statSync(p).mtimeMs;
            if (m > newest) newest = m;
          } catch {
          }
        }
      }
    };
    walk(abs);
    if (newest > 0) return Math.round(newest);
    const st = import_fs3.default.statSync(abs);
    if (Number.isFinite(st.mtimeMs) && st.mtimeMs > 0) return Math.round(st.mtimeMs);
  } catch {
  }
  return void 0;
}
function moddedFolderMap(gameRoot) {
  const root2 = moddedRoot(gameRoot);
  if (!import_fs3.default.existsSync(root2)) return void 0;
  const map = /* @__PURE__ */ new Map();
  try {
    for (const e of import_fs3.default.readdirSync(root2, { withFileTypes: true })) {
      if (e.isDirectory()) map.set(e.name.toLowerCase(), import_path4.default.join(root2, e.name));
    }
  } catch {
  }
  return map;
}
function findModdedFolder(gameRoot, names) {
  const dirs = moddedFolderMap(gameRoot);
  if (!dirs) return void 0;
  for (const n of names) {
    if (!n) continue;
    const abs = dirs.get(String(n).toLowerCase());
    if (abs) return abs;
  }
  return void 0;
}
function pluginDiskPath(pluginDir, rel) {
  const direct = import_path4.default.join(pluginDir, rel);
  if (import_fs3.default.existsSync(direct)) return direct;
  const stem = direct.replace(/\.dll$/i, "");
  for (const alt of [
    `${direct}.disabled`,
    `${direct}.disable`,
    `${stem}.disabled`,
    `${stem}.disable`,
    `${direct}.1`
  ]) {
    if (import_fs3.default.existsSync(alt)) return alt;
  }
  return direct;
}
function collectCandidates(pluginDir, pluginFiles) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const rel of pluginFiles.slice(0, 16)) {
    for (const c of extractPluginCandidates(pluginDiskPath(pluginDir, rel))) {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
  }
  return out;
}
function resolveIdentifyName(title, candidates) {
  return MOD_GUID_OVERRIDES[title] ?? candidates[0];
}
var DISABLED = `.${DISABLED_EXTENSION}`;
function titleMatchScore(title, guid) {
  if (!title || !guid) return 0;
  const t = title.toLowerCase();
  const g = guid.toLowerCase();
  const last = g.split(".").pop() ?? "";
  if (t === last || t === g) return 3;
  if (last.includes(t) || t.includes(last)) return 2;
  const tJ = t.replace(/[^a-z0-9]/g, "");
  const gJ = g.replace(/[^a-z0-9]/g, "");
  if (gJ.includes(tJ) || tJ.includes(gJ)) return 1;
  return 0;
}
function buildModItem(gameRoot, modRoot, manifest, supports) {
  const dirName = import_path4.default.basename(modRoot);
  const meta = loadMetadata(modRoot, manifest);
  return {
    guid: manifest.guid,
    name: manifest.name,
    author: manifest.author,
    version: manifest.version,
    description: manifest.description,
    identifyName: manifest.guid,
    installedAt: dirInstalledAt(modRoot),
    moddedFolder: findModdedFolder(gameRoot, [dirName, manifest.name, manifest.guid]),
    directoryName: dirName,
    installDir: modRoot,
    activated: meta.activated !== false,
    supportsCurrentVersion: supports,
    pluginFiles: manifest.plugins,
    assetPaths: manifest.assets.map((a) => a.destination || a.localPath),
    loose: false,
    gamebananaSource: meta.gamebananaSource
  };
}
function parsePluginEntry(name) {
  if (!name || name[0] === ".") return null;
  const lc = name.toLowerCase();
  if (lc.endsWith(".disabled") || lc.endsWith(".disable")) {
    const raw = lc.endsWith(".disabled") ? name.slice(0, -9) : name.slice(0, -8);
    const stem = raw.toLowerCase().endsWith(".dll") ? raw.slice(0, -4) : raw;
    if (!stem) return null;
    return { stem, file: `${stem}.dll`, disabled: true };
  }
  if (lc.endsWith(".dll")) return { stem: name.slice(0, -4), file: name, disabled: false };
  const backup = /^(.*\.dll)\.\d+$/i.exec(name);
  if (backup) return { stem: backup[1].slice(0, -4), file: backup[1], disabled: true };
  return null;
}
function collectPlugins(dir, prefix = "", out = []) {
  for (const f of import_fs3.default.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? import_path4.default.join(prefix, f.name) : f.name;
    if (f.isFile()) {
      const norm = parsePluginEntry(f.name);
      if (norm) out.push({ file: norm.file === f.name ? rel : import_path4.default.join(prefix, norm.file), disabled: norm.disabled });
    } else if (f.isDirectory()) {
      if (f.name.startsWith(".")) continue;
      collectPlugins(import_path4.default.join(dir, f.name), rel, out);
    }
  }
  return out;
}
function buildLegacyItem(installDir, title, plugins, activated, identifyName, group, guidOverride) {
  return {
    guid: guidOverride ?? `legacy:${title}`,
    name: title,
    author: "BepInEx plugin",
    version: "",
    description: void 0,
    identifyName,
    installedAt: dirInstalledAt(installDir),
    moddedFolder: void 0,
    directoryName: import_path4.default.basename(installDir),
    installDir,
    activated,
    supportsCurrentVersion: true,
    pluginFiles: plugins,
    assetPaths: [],
    loose: false,
    group
  };
}
function scanRepository(gameRoot, gameVersion) {
  const pluginsDir = bepinexPluginsDir(gameRoot);
  if (!import_fs3.default.existsSync(pluginsDir)) return [];
  const mods2 = [];
  const coveredStems = /* @__PURE__ */ new Set();
  const legacyMetas = [];
  const entries = import_fs3.default.readdirSync(pluginsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const modRoot = import_path4.default.join(pluginsDir, entry.name);
    const manifest = loadModManifest(modRoot);
    if (manifest) {
      const supports = matchSupportedVersion(modRoot, gameVersion);
      mods2.push(buildModItem(gameRoot, modRoot, manifest, supports));
      for (const p of manifest.plugins) {
        const norm = parsePluginEntry(import_path4.default.basename(p));
        if (norm) coveredStems.add(norm.stem.toLowerCase());
      }
      continue;
    }
    const plugins = collectPlugins(modRoot);
    if (plugins.length === 0) continue;
    const byStem = /* @__PURE__ */ new Map();
    for (const p of plugins) {
      const parsed = parsePluginEntry(import_path4.default.basename(p.file));
      if (!parsed) continue;
      const key = parsed.stem.toLowerCase();
      const cur = byStem.get(key) ?? { stem: parsed.stem };
      if (p.disabled) cur.disabled = cur.disabled ?? p.file;
      else cur.active = cur.active ?? p.file;
      byStem.set(key, cur);
    }
    for (const { stem, active, disabled } of byStem.values()) {
      const file = active ?? disabled ?? "";
      if (!file) continue;
      const activated = !!active;
      const candidates = collectCandidates(modRoot, [file]);
      const item = buildLegacyItem(
        modRoot,
        stem,
        [file],
        activated,
        resolveIdentifyName(entry.name, candidates),
        entry.name,
        `legacy:${entry.name}/${stem}`
      );
      mods2.push(item);
      legacyMetas.push({ item, candidates });
    }
    for (const p of plugins) {
      coveredStems.add(import_path4.default.basename(p.file).toLowerCase());
    }
  }
  const roots = [];
  const rootIndex = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const norm = parsePluginEntry(entry.name);
    if (!norm) continue;
    const stem = norm.stem.toLowerCase();
    if (coveredStems.has(stem)) continue;
    let group = rootIndex.get(stem);
    if (!group) {
      group = { title: norm.stem, active: [], disabled: [] };
      rootIndex.set(stem, group);
      roots.push(group);
    }
    if (norm.disabled) group.disabled.push(norm.file);
    else group.active.push(norm.file);
  }
  for (const g of roots) {
    if (g.active.length > 0) {
      const candidates = collectCandidates(pluginsDir, g.active);
      const item = buildLegacyItem(
        pluginsDir,
        g.title,
        g.active,
        true,
        resolveIdentifyName(g.title, candidates)
      );
      mods2.push(item);
      legacyMetas.push({ item, candidates });
    } else if (g.disabled.length > 0) {
      const candidates = collectCandidates(pluginsDir, [g.disabled[0]]);
      const item = buildLegacyItem(
        pluginsDir,
        g.title,
        [g.disabled[0]],
        false,
        resolveIdentifyName(g.title, candidates)
      );
      mods2.push(item);
      legacyMetas.push({ item, candidates });
    }
  }
  const dirs = moddedFolderMap(gameRoot);
  if (dirs && legacyMetas.length > 0) {
    const identFreq = /* @__PURE__ */ new Map();
    for (const le of legacyMetas) {
      const idn = le.item.identifyName;
      if (idn) {
        const k = String(idn).toLowerCase();
        identFreq.set(k, (identFreq.get(k) ?? 0) + 1);
      }
    }
    const claimed = /* @__PURE__ */ new Set();
    for (const m of mods2) {
      if (m.moddedFolder) claimed.add(import_path4.default.basename(m.moddedFolder).toLowerCase());
    }
    for (const le of legacyMetas) {
      const abs = le.item.identifyName ? dirs.get(String(le.item.identifyName).toLowerCase()) : void 0;
      if (abs) claimed.add(import_path4.default.basename(abs).toLowerCase());
    }
    const identOwners = /* @__PURE__ */ new Map();
    for (const le of legacyMetas) {
      const idn = le.item.identifyName;
      if (!idn) continue;
      const abs = dirs.get(String(idn).toLowerCase());
      if (!abs) continue;
      const k = import_path4.default.basename(abs).toLowerCase();
      const score = Math.max(titleMatchScore(le.item.name, idn), identFreq.get(k) === 1 ? 1 : 0);
      const arr = identOwners.get(k) ?? [];
      arr.push({ le, score });
      identOwners.set(k, arr);
    }
    for (const [k, owners] of identOwners) {
      const scored = owners.filter((o) => o.score > 0);
      const pool = scored.length ? scored : owners;
      const best = pool.reduce((a, b) => b.score > a.score ? b : a, pool[0]);
      if (pool.length !== 1 && best.score === 0) continue;
      best.le.item.moddedFolder = dirs.get(k);
      claimed.add(k);
    }
    for (const le of legacyMetas) {
      if (le.item.moddedFolder) continue;
      for (const c of le.candidates) {
        const abs = c ? dirs.get(c.toLowerCase()) : void 0;
        if (abs && !claimed.has(import_path4.default.basename(abs).toLowerCase())) {
          le.item.moddedFolder = abs;
          claimed.add(import_path4.default.basename(abs).toLowerCase());
          break;
        }
      }
      if (!le.item.moddedFolder) {
        const tf = findModdedFolder(gameRoot, [le.item.name]);
        if (tf && !claimed.has(import_path4.default.basename(tf).toLowerCase())) le.item.moddedFolder = tf;
      }
    }
  }
  for (const m of mods2) applyResolvedPaths(gameRoot, m);
  return mods2;
}
function applyResolvedPaths(gameRoot, m) {
  const pluginsDir = bepinexPluginsDir(gameRoot);
  const active = m.pluginFiles.find((p) => /\.dll$/i.test(p) && !/\.(disabled|disable|\.\d+)$/i.test(p)) ?? m.pluginFiles[0];
  if (active) {
    const abs = import_path4.default.isAbsolute(active) ? active : import_path4.default.join(m.installDir, active);
    m.dllFile = abs;
    m.dllDirectory = import_path4.default.dirname(abs);
    m.loose = samePath(m.dllDirectory, pluginsDir);
  } else {
    m.loose = samePath(m.installDir, pluginsDir);
  }
  m.configFile = findConfigFile(import_path4.default.join(import_path4.default.dirname(pluginsDir), "config"), m);
}
function samePath(a, b) {
  return a.toLowerCase().replace(/[\\/]+$/, "") === b.toLowerCase().replace(/[\\/]+$/, "");
}
function findConfigFile(configDir, m) {
  let cfgFiles;
  try {
    if (!import_fs3.default.existsSync(configDir)) return void 0;
    cfgFiles = import_fs3.default.readdirSync(configDir).filter((f) => /\.cfg$/i.test(f));
  } catch {
    return void 0;
  }
  if (!cfgFiles.length) return void 0;
  const stems = (m.pluginFiles || []).map((p) => import_path4.default.basename(p).replace(/\.dll$/i, "").toLowerCase());
  for (const stem of stems) {
    if (!stem) continue;
    const hit = cfgFiles.find((f) => {
      const s = f.toLowerCase().replace(/\.cfg$/i, "");
      return s === stem || s.startsWith(stem) || stem.startsWith(s);
    });
    if (hit) return import_path4.default.join(configDir, hit);
  }
  const idn = (m.identifyName || "").toLowerCase();
  if (idn) {
    const byGuid = cfgFiles.find((f) => {
      const s = f.toLowerCase().replace(/\.cfg$/i, "");
      return s.includes(idn) || idn.includes(s);
    });
    if (byGuid) return import_path4.default.join(configDir, byGuid);
  }
  return void 0;
}

// scripts/_scanprobe.ts
var root = process.argv[2] || "D:/steam/steamapps/common/Baldi's Basics Plus";
var mods = scanRepository(root, void 0);
console.log("total mods =", mods.length);
console.log("--- name \u5339\u914D balditexturepacks ---");
for (const m of mods.filter((m2) => /balditexturepacks/i.test(m2.name))) {
  console.log(
    JSON.stringify({
      name: m.name,
      guid: m.guid,
      directoryName: m.directoryName,
      identifyName: m.identifyName,
      activated: m.activated,
      pluginFiles: m.pluginFiles
    })
  );
}
console.log("--- \u524D\u7F6E\u68C0\u67E5\uFF08level studio\uFF09---");
var patterns = [
  ["devApi 383711", [/mtm101baldapi/i]],
  ["loader 617565", [/plusstudiolevelloader/i]],
  ["levelStudio 617567", [/pluslevelstudio/i, /levelstudio/i]]
];
for (const [label, pats] of patterns) {
  const installed = mods.some((m) => {
    const names = [m.name, m.identifyName, m.dllFile, m.dllDirectory, ...m.pluginFiles ?? []];
    return names.some((n) => !!n && pats.some((p) => p.test(String(n))));
  });
  console.log(label, "->", installed);
}
console.log("--- BaldiTexturePacks \u662F\u5426\u5728\u5217\u8868\u91CC (name \u5339\u914D) ---");
console.log(mods.some((m) => /balditexturepacks/i.test(m.name)));
console.log("--- \u6240\u6709 mod \u540D\u79F0\uFF08\u524D 60\uFF09---");
for (const m of mods.slice(0, 60)) console.log(`  ${m.activated ? "ON " : "off"} ${m.name}`);
