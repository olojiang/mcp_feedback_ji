module.exports = {
  Uri: {
    file: (p) => ({ fsPath: p }),
    joinPath: (base, ...segments) => {
      const root = base.fsPath || String(base)
      const joined = [root, ...segments].join('/')
      return {
        fsPath: joined,
        toString: () => joined,
        with: () => ({ toString: () => joined }),
      }
    },
  },
  env: {
    clipboard: {
      writeText: async () => {},
      readText: async () => '',
    },
  },
  commands: {
    executeCommand: async () => {},
  },
  window: {
    showInformationMessage: () => {},
    showWarningMessage: () => {},
    showErrorMessage: () => {},
    setStatusBarMessage: () => {},
  },
}
