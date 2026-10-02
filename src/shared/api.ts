import type { ConfigFileDto, GamebananaCommentDto, GamebananaCommentsDto, GameEnvironment, GamebananaSearchResult, GamebananaSubmissionDto, GamebananaUpdatesDto, InstallProgress, InstallResult, JobProgress, LevelStudioInstallResult, LevelStudioPrereqItem, ModInstallOutcome, ModItemDto, ModUpdateInfoDto, OpenUrlPayload, PosterPackInstallResult, PosterPackListResult, PosterPackProgress, ReadmeFileDto, Result, TexturePackInstallResult, TexturePackListResult, TexturePackProgress, ToolboxDirDto, CustomLevelDto } from './types';
export interface AppApi {
    game: {
        selectDir: () => Promise<Result<GameEnvironment>>;
        setDir: (exePath: string) => Promise<Result<GameEnvironment>>;
        get: () => Promise<Result<GameEnvironment>>;
        launch: () => Promise<Result<{
            pid?: number;
        }>>;
        launchSteam: () => Promise<Result<{
            launched: boolean;
        }>>;
        isRunning: () => Promise<Result<{
            running: boolean;
        }>>;
        stop: () => Promise<Result<{
            stopped: boolean;
        }>>;
        onRunningChanged: (cb: (running: boolean) => void) => () => void;
    };
    mods: {
        list: () => Promise<Result<ModItemDto[]>>;
        install: (archivePath: string) => Promise<Result<ModInstallOutcome>>;
        installUnmanaged: (archivePath: string) => Promise<Result<{
            modName: string;
            readmes: ReadmeFileDto[];
        }>>;
        cancelInstall: () => Promise<void>;
        uninstall: (guid: string) => Promise<Result>;
        toggle: (guid: string, activate: boolean, installDir?: string) => Promise<Result<{
            activated: boolean;
        }>>;
        checkUpdate: (guid: string) => Promise<Result<ModUpdateInfoDto>>;
        update: (guid: string) => Promise<Result>;
    };
    banana: {
        search: (page: number, query?: string, category?: number) => Promise<Result<GamebananaSearchResult>>;
        install: (submissionId: number, fileId?: number) => Promise<Result<{ jobId: string }>>;
        installUrl: (url: string, modType?: string, modId?: number) => Promise<Result<{ jobId: string }>>;
        get: (submissionId: number) => Promise<Result<GamebananaSubmissionDto>>;
        getComments: (submissionId: number) => Promise<Result<GamebananaCommentsDto>>;
        getUpdates: (submissionId: number) => Promise<Result<GamebananaUpdatesDto>>;
        getPostReplies: (postId: number) => Promise<Result<GamebananaCommentDto[]>>;
        levelStudioPrereq: () => Promise<Result<LevelStudioPrereqItem[]>>;
        cancel: (jobId?: string) => Promise<void>;
        cancelJob: (jobId: string) => Promise<void>;
        clearJob: (jobId: string) => Promise<void>;
        clearCompleted: () => Promise<void>;
        getJobs: () => Promise<JobProgress[]>;
        onJobProgress: (cb: (p: JobProgress) => void) => () => void;
    };
    ui: {
        pickZip: () => Promise<Result<{
            path: string;
        }>>;
        openFolder: (path: string) => Promise<void>;
        revealFile: (path: string) => Promise<void>;
        openExternal: (url: string) => Promise<void>;
    };
    window: {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
        registerMaximizeEvents: () => Promise<void>;
        onMaximizedChanged: (cb: (maximized: boolean) => void) => () => void;
        prankSize: () => Promise<void>;
        jiggle: () => Promise<void>;
        skew: () => Promise<void>;
    };
    toolbox: {
        dirs: () => Promise<Result<ToolboxDirDto[]>>;
        openDir: (path: string) => Promise<boolean>;
        readLog: () => Promise<Result<{
            text: string;
        }>>;
    };
    configs: {
        list: () => Promise<Result<ConfigFileDto[]>>;
        set: (cfgPath: string, section: string, key: string, value: string) => Promise<Result>;
        delete: (cfgPath: string) => Promise<Result>;
    };
    textures: {
        list: () => Promise<Result<TexturePackListResult>>;
        install: (archivePath: string) => Promise<Result<TexturePackInstallResult>>;
        uninstall: (folderName: string) => Promise<Result>;
        toggleEnabled: (folderName: string, enabled: boolean) => Promise<Result>;
        probe: (archivePath: string) => Promise<Result<boolean>>;
    };
    customLevel: {
        list: () => Promise<Result<CustomLevelDto[]>>;
        probe: (archivePath: string) => Promise<Result<boolean>>;
        install: (archivePath: string) => Promise<Result<LevelStudioInstallResult>>;
        toggle: (fileName: string, enabled: boolean) => Promise<Result>;
        delete: (fileName: string) => Promise<Result>;
    };
    posters: {
        list: () => Promise<Result<PosterPackListResult>>;
        install: (archivePath: string) => Promise<Result<PosterPackInstallResult>>;
        uninstall: (folderName: string) => Promise<Result>;
        toggleEnabled: (folderName: string, enabled: boolean) => Promise<Result>;
        probe: (archivePath: string) => Promise<Result<boolean>>;
    };
    setup: {
        status: () => Promise<Result<{
            hasBepInEx: boolean;
        }>>;
        installBepInEx: () => Promise<Result<boolean>>;
        installDevApi: () => Promise<Result<InstallResult>>;
        installAll: () => Promise<Result<InstallResult>>;
        onProgress: (cb: (p: InstallProgress) => void) => () => void;
        onDevApiProgress: (cb: (p: InstallProgress) => void) => () => void;
        onInstallAllProgress: (cb: (p: InstallProgress) => void) => () => void;
    };
    app: {
        getTheme: () => Promise<string>;
        setTheme: (theme: string) => Promise<void>;
        getFont: () => Promise<string>;
        setFont: (font: string) => Promise<void>;
        listFonts: () => Promise<string[]>;
        getLocale: () => Promise<string>;
        setLocale: (locale: string) => Promise<void>;
        getSplash: () => Promise<boolean>;
        setSplash: (enabled: boolean) => Promise<void>;
        getDebugLogging: () => Promise<boolean>;
        setDebugLogging: (enabled: boolean) => Promise<void>;
        getNavOpen: () => Promise<boolean>;
        setNavOpen: (open: boolean) => Promise<void>;
        getVerticalLayout: () => Promise<boolean>;
        setVerticalLayout: (enabled: boolean) => Promise<void>;
        getAutoInstall: () => Promise<boolean>;
        setAutoInstall: (enabled: boolean) => Promise<void>;
        resetSettings: () => Promise<void>;
        onThemeChanged: (cb: (theme: string) => void) => () => void;
        onFontChanged: (cb: (font: string) => void) => () => void;
        onLocaleChanged: (cb: (locale: string) => void) => () => void;
        onGameCleared: (cb: () => void) => () => void;
        onInstallProgress: (cb: (p: InstallProgress) => void) => () => void;
        onTexturePackProgress: (cb: (p: TexturePackProgress) => void) => () => void;
        onPosterPackProgress: (cb: (p: PosterPackProgress) => void) => () => void;
        onOpenUrl: (cb: (url: OpenUrlPayload) => void) => () => void;
    };
}
