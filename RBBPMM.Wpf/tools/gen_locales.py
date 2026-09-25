#!/usr/bin/env python3
"""生成 RBBPMM 的 12 份语言资源(Resources/<code>.json)。

Electron 版靠 TypeScript 的 `Required<Messages>` 在编译期强制各语言键完全一致；
.NET 版没有等价机制，所以用本脚本做「单一真源」生成 —— 键集由 KEYS 唯一决定，
不可能出现缺键/多键。配套的 LocaleParityTests 会在 CI/本地测试时再次校验。

用法:
    python RBBPMM.Wpf/tools/gen_locales.py

新增文案: 在 KEYS 里加一行, 在每份 LANG 里补对应值, 重跑脚本。
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 功能页（Mods / 材质包 / 关卡 / GameBanana）的追加键与译文单独成模块，
# 否则本文件会长到难以审阅；键集仍由下面的校验统一把关。
from locales_extra import EXTRA, KEYS_EXTRA  # noqa: E402

# ---------------------------------------------------------------------------
# 键集（唯一真源）。顺序即输出顺序。
# ---------------------------------------------------------------------------
KEYS_BASE = [
    "app.title",
    "app.subtitle",
    "nav.mods",
    "nav.textures",
    "nav.levels",
    "nav.gamebanana",
    "nav.settings",
    "page.mods.title",
    "page.textures.title",
    "page.levels.title",
    "page.gamebanana.title",
    "page.settings.title",
    "shell.toggleTheme",
    "settings.appearance",
    "settings.theme",
    "settings.language",
    "settings.language.hint",
    "settings.theme.toLight",
    "settings.theme.toDark",
    "settings.current",
    "theme.light",
    "theme.dark",
]

# 完整键集 = 第一阶段（外壳/导航/设置）+ 功能页。
# 这里保留首次出现的位置：曾经有 6 个键同时出现在两个列表里，dict 构建会把重复悄悄吃掉，
# 于是"语言 × 键"的计数比真实键数多算，改文案时也分不清哪份生效。现在有守卫兜住。
KEYS = KEYS_BASE + KEYS_EXTRA

LANGUAGES: dict[str, dict[str, str]] = {
    "en": {
        "app.title": "RBBPMM — Baldi's Basics Plus Mod Manager",
        "app.subtitle": "Baldi's Basics Plus Mod Manager",
        "nav.mods": "Mods",
        "nav.textures": "Texture Packs",
        "nav.levels": "Custom Levels",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "Settings",
        "page.mods.title": "Your Mods",
        "page.textures.title": "Texture Packs",
        "page.levels.title": "Custom Levels",
        "page.gamebanana.title": "Browse GameBanana",
        "page.settings.title": "Settings",
        "shell.toggleTheme": "Toggle light / dark theme",
        "settings.appearance": "Appearance",
        "settings.theme": "Theme",
        "settings.language": "Language",
        "settings.language.hint": "Switching applies immediately and is saved.",
        "settings.theme.toLight": "Switch to Light",
        "settings.theme.toDark": "Switch to Dark",
        "settings.current": "Current",
        "theme.light": "Light",
        "theme.dark": "Dark",
        "egg.flee.arm": "Do not click",
        "egg.flee.armed": "Welp.",
    },
    "zh-CN": {
        "app.title": "RBBPMM — Baldi's Basics Plus 模组管理器",
        "app.subtitle": "Baldi's Basics Plus 模组管理器",
        "nav.mods": "模组",
        "nav.textures": "材质包",
        "nav.levels": "自定义关卡",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "设置",
        "page.mods.title": "我的模组",
        "page.textures.title": "材质包",
        "page.levels.title": "自定义关卡",
        "page.gamebanana.title": "浏览 GameBanana",
        "page.settings.title": "设置",
        "shell.toggleTheme": "切换浅色 / 深色主题",
        "settings.appearance": "外观",
        "settings.theme": "主题",
        "settings.language": "语言",
        "settings.language.hint": "切换后立即生效并保存。",
        "settings.theme.toLight": "切换到浅色",
        "settings.theme.toDark": "切换到深色",
        "settings.current": "当前",
        "theme.light": "浅色",
        "theme.dark": "深色",
        "egg.flee.arm": "别点",
        "egg.flee.armed": "完蛋",
    },
    "zh-TW": {
        "app.title": "RBBPMM — Baldi's Basics Plus 模組管理器",
        "app.subtitle": "Baldi's Basics Plus 模組管理器",
        "nav.mods": "模組",
        "nav.textures": "材質包",
        "nav.levels": "自訂關卡",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "設定",
        "page.mods.title": "我的模組",
        "page.textures.title": "材質包",
        "page.levels.title": "自訂關卡",
        "page.gamebanana.title": "瀏覽 GameBanana",
        "page.settings.title": "設定",
        "shell.toggleTheme": "切換淺色 / 深色主題",
        "settings.appearance": "外觀",
        "settings.theme": "主題",
        "settings.language": "語言",
        "settings.language.hint": "切換後立即生效並儲存。",
        "settings.theme.toLight": "切換到淺色",
        "settings.theme.toDark": "切換到深色",
        "settings.current": "目前",
        "theme.light": "淺色",
        "theme.dark": "深色",
        "egg.flee.arm": "別點",
        "egg.flee.armed": "完蛋",
    },
    "ja": {
        "app.title": "RBBPMM — Baldi's Basics Plus MOD マネージャー",
        "app.subtitle": "Baldi's Basics Plus MOD マネージャー",
        "nav.mods": "MOD",
        "nav.textures": "テクスチャパック",
        "nav.levels": "カスタムレベル",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "設定",
        "page.mods.title": "マイMOD",
        "page.textures.title": "テクスチャパック",
        "page.levels.title": "カスタムレベル",
        "page.gamebanana.title": "GameBanana を閲覧",
        "page.settings.title": "設定",
        "shell.toggleTheme": "ライト / ダークテーマを切り替え",
        "settings.appearance": "外観",
        "settings.theme": "テーマ",
        "settings.language": "言語",
        "settings.language.hint": "切り替えるとすぐに反映され、保存されます。",
        "settings.theme.toLight": "ライトに切り替え",
        "settings.theme.toDark": "ダークに切り替え",
        "settings.current": "現在",
        "theme.light": "ライト",
        "theme.dark": "ダーク",
        "egg.flee.arm": "押すな",
        "egg.flee.armed": "終わった",
    },
    "ko": {
        "app.title": "RBBPMM — Baldi's Basics Plus 모드 관리자",
        "app.subtitle": "Baldi's Basics Plus 모드 관리자",
        "nav.mods": "모드",
        "nav.textures": "텍스처 팩",
        "nav.levels": "커스텀 레벨",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "설정",
        "page.mods.title": "내 모드",
        "page.textures.title": "텍스처 팩",
        "page.levels.title": "커스텀 레벨",
        "page.gamebanana.title": "GameBanana 둘러보기",
        "page.settings.title": "설정",
        "shell.toggleTheme": "라이트 / 다크 테마 전환",
        "settings.appearance": "모양",
        "settings.theme": "테마",
        "settings.language": "언어",
        "settings.language.hint": "전환하면 즉시 적용되고 저장됩니다.",
        "settings.theme.toLight": "라이트로 전환",
        "settings.theme.toDark": "다크로 전환",
        "settings.current": "현재",
        "theme.light": "라이트",
        "theme.dark": "다크",
        "egg.flee.arm": "누르지 마",
        "egg.flee.armed": "망했다",
    },
    "es": {
        "app.title": "RBBPMM — Gestor de mods de Baldi's Basics Plus",
        "app.subtitle": "Gestor de mods de Baldi's Basics Plus",
        "nav.mods": "Mods",
        "nav.textures": "Paquetes de texturas",
        "nav.levels": "Niveles personalizados",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "Ajustes",
        "page.mods.title": "Tus mods",
        "page.textures.title": "Paquetes de texturas",
        "page.levels.title": "Niveles personalizados",
        "page.gamebanana.title": "Explorar GameBanana",
        "page.settings.title": "Ajustes",
        "shell.toggleTheme": "Cambiar tema claro / oscuro",
        "settings.appearance": "Apariencia",
        "settings.theme": "Tema",
        "settings.language": "Idioma",
        "settings.language.hint": "El cambio se aplica y se guarda al instante.",
        "settings.theme.toLight": "Cambiar a claro",
        "settings.theme.toDark": "Cambiar a oscuro",
        "settings.current": "Actual",
        "theme.light": "Claro",
        "theme.dark": "Oscuro",
        "egg.flee.arm": "No hagas clic",
        "egg.flee.armed": "Ay, no.",
    },
    "pt": {
        "app.title": "RBBPMM — Gerenciador de mods de Baldi's Basics Plus",
        "app.subtitle": "Gerenciador de mods de Baldi's Basics Plus",
        "nav.mods": "Mods",
        "nav.textures": "Pacotes de texturas",
        "nav.levels": "Níveis personalizados",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "Configurações",
        "page.mods.title": "Seus mods",
        "page.textures.title": "Pacotes de texturas",
        "page.levels.title": "Níveis personalizados",
        "page.gamebanana.title": "Navegar no GameBanana",
        "page.settings.title": "Configurações",
        "shell.toggleTheme": "Alternar tema claro / escuro",
        "settings.appearance": "Aparência",
        "settings.theme": "Tema",
        "settings.language": "Idioma",
        "settings.language.hint": "A troca é aplicada e salva imediatamente.",
        "settings.theme.toLight": "Mudar para claro",
        "settings.theme.toDark": "Mudar para escuro",
        "settings.current": "Atual",
        "theme.light": "Claro",
        "theme.dark": "Escuro",
        "egg.flee.arm": "Não clique",
        "egg.flee.armed": "Ferrou.",
    },
    "fr": {
        "app.title": "RBBPMM — Gestionnaire de mods pour Baldi's Basics Plus",
        "app.subtitle": "Gestionnaire de mods pour Baldi's Basics Plus",
        "nav.mods": "Mods",
        "nav.textures": "Packs de textures",
        "nav.levels": "Niveaux personnalisés",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "Paramètres",
        "page.mods.title": "Mes mods",
        "page.textures.title": "Packs de textures",
        "page.levels.title": "Niveaux personnalisés",
        "page.gamebanana.title": "Parcourir GameBanana",
        "page.settings.title": "Paramètres",
        "shell.toggleTheme": "Basculer le thème clair / sombre",
        "settings.appearance": "Apparence",
        "settings.theme": "Thème",
        "settings.language": "Langue",
        "settings.language.hint": "Le changement s'applique et est enregistré immédiatement.",
        "settings.theme.toLight": "Passer en clair",
        "settings.theme.toDark": "Passer en sombre",
        "settings.current": "Actuel",
        "theme.light": "Clair",
        "theme.dark": "Sombre",
        "egg.flee.arm": "Clique pas",
        "egg.flee.armed": "C'est foutu.",
    },
    "de": {
        "app.title": "RBBPMM — Mod-Manager für Baldi's Basics Plus",
        "app.subtitle": "Mod-Manager für Baldi's Basics Plus",
        "nav.mods": "Mods",
        "nav.textures": "Texturpakete",
        "nav.levels": "Eigene Level",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "Einstellungen",
        "page.mods.title": "Deine Mods",
        "page.textures.title": "Texturpakete",
        "page.levels.title": "Eigene Level",
        "page.gamebanana.title": "GameBanana durchsuchen",
        "page.settings.title": "Einstellungen",
        "shell.toggleTheme": "Helles / dunkles Design umschalten",
        "settings.appearance": "Aussehen",
        "settings.theme": "Design",
        "settings.language": "Sprache",
        "settings.language.hint": "Die Änderung wird sofort angewendet und gespeichert.",
        "settings.theme.toLight": "Zu Hell wechseln",
        "settings.theme.toDark": "Zu Dunkel wechseln",
        "settings.current": "Aktuell",
        "theme.light": "Hell",
        "theme.dark": "Dunkel",
        "egg.flee.arm": "Nicht klicken",
        "egg.flee.armed": "Tja.",
    },
    "ru": {
        "app.title": "RBBPMM — менеджер модов для Baldi's Basics Plus",
        "app.subtitle": "менеджер модов для Baldi's Basics Plus",
        "nav.mods": "Моды",
        "nav.textures": "Текстур-паки",
        "nav.levels": "Свои уровни",
        "nav.gamebanana": "GameBanana",
        "nav.settings": "Настройки",
        "page.mods.title": "Ваши моды",
        "page.textures.title": "Текстур-паки",
        "page.levels.title": "Свои уровни",
        "page.gamebanana.title": "Просмотр GameBanana",
        "page.settings.title": "Настройки",
        "shell.toggleTheme": "Переключить светлую / тёмную тему",
        "settings.appearance": "Внешний вид",
        "settings.theme": "Тема",
        "settings.language": "Язык",
        "settings.language.hint": "Изменение применяется и сохраняется сразу.",
        "settings.theme.toLight": "Светлая тема",
        "settings.theme.toDark": "Тёмная тема",
        "settings.current": "Текущая",
        "theme.light": "Светлая",
        "theme.dark": "Тёмная",
        "egg.flee.arm": "Не нажимай",
        "egg.flee.armed": "Всё пропало.",
    },
    # 亚等约语（彩蛋语言）—— 词根与 Electron 版 ydyy 保持一致
    "ydyy": {
        "app.title": "RBBPMM — Dóva Kêtolog Baldi's Basics Plus",
        "app.subtitle": "Baldi's Basics Plus Dóva Kêtolog",
        "nav.mods": "Dóva",
        "nav.textures": "Távas",
        "nav.levels": "Lávas",
        "nav.gamebanana": "Kêtolog",
        "nav.settings": "Natás",
        "page.mods.title": "Dóva pónas",
        "page.textures.title": "Távas",
        "page.levels.title": "Lávas motás",
        "page.gamebanana.title": "GameBanana Kêtolog",
        "page.settings.title": "Natás",
        "shell.toggleTheme": "Tela luma / nud sala",
        "settings.appearance": "Tela",
        "settings.theme": "Tela",
        "settings.language": "Olón",
        "settings.language.hint": "Olón sala — nésav miv pónas.",
        "settings.theme.toLight": "Luma sala",
        "settings.theme.toDark": "Nud sala",
        "settings.current": "Suv",
        "theme.light": "Luma",
        "theme.dark": "Nud",
        "mods.empty": "Dóva pónas hic — láta, deláta, depóna, resta motol tanol.",
        "mods.emptyHint": "(Phase 5 — Core ló dóva póna vola.)",
        "textures.empty": "Távas póna / depóna, README motin hic.",
        "textures.emptyHint": "(Phase 5 — Core.TexturePackService.)",
        "levels.empty": "Lávas pametion hic.",
        "levels.emptyHint": "(Phase 5 — Core lávas motás.)",

        "egg.flee.arm": "Cuna nal!",
        "egg.flee.armed": "Sálva.",
    },
    # fish（彩蛋语言）：Electron 版 fish 的每个键都是字面量 'FISH'
    "fish": {k: "FISH" for k in KEYS},
}


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.normpath(os.path.join(here, "..", "RBBPMM", "Resources"))
    os.makedirs(out_dir, exist_ok=True)

    # 合并：第一阶段译文（本文件）+ 功能页译文（locales_extra.py）
    merged: dict[str, dict[str, str]] = {
        lang: {**table, **EXTRA.get(lang, {})} for lang, table in LANGUAGES.items()
    }

    # 先做一致性自检，避免写出缺键/多键的语言包
    problems: list[str] = []

    # 键不能重复声明：合并后的 dict 会把重复悄悄吃掉，导致"键数"虚高且看不出哪份译文生效。
    seen: set[str] = set()
    for key in KEYS:
        if key in seen:
            problems.append(f"键重复声明: {key}")
        seen.add(key)

    for lang in EXTRA:
        if lang not in LANGUAGES:
            problems.append(f"{lang}: locales_extra 有译文但 LANGUAGES 未登记该语言")

    for lang, table in merged.items():
        missing = [k for k in KEYS if k not in table]
        extra = [k for k in table if k not in KEYS]
        if missing:
            problems.append(f"{lang}: 缺键 {missing}")
        if extra:
            problems.append(f"{lang}: 多键 {extra}")
    if problems:
        print("语言包不一致，未写出任何文件:")
        for p in problems:
            print("  -", p)
        return 1

    for lang in LANGUAGES:
        path = os.path.join(out_dir, f"{lang}.json")
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump({k: merged[lang][k] for k in KEYS}, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        print(f"written {os.path.relpath(path, here)}  ({len(KEYS)} keys)")

    print(f"\nOK: {len(LANGUAGES)} 语言 × {len(KEYS)} 键")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
