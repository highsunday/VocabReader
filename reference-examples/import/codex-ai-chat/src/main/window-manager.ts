export interface ManagedWindow {
  isDestroyed(): boolean
  focus(): void
  once(event: 'closed', listener: () => void): unknown
}

export interface WindowManager<T extends ManagedWindow> {
  open(): T
  current(): T | null
}

export function createWindowManager<T extends ManagedWindow>(createWindow: () => T): WindowManager<T> {
  let mainWindow: T | null = null

  return {
    open() {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus()
        return mainWindow
      }

      const window = createWindow()
      mainWindow = window
      window.once('closed', () => {
        if (mainWindow === window) mainWindow = null
      })
      return window
    },
    current() {
      return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    }
  }
}
