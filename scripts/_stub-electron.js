module.exports = {
  net: { fetch: (...args) => globalThis.fetch(...args) },
  app: { getPath: () => process.cwd(), isPackaged: false },
  ipcMain: { handle: () => {} },
  shell: {}
}
