declare global {
  interface Window {
    isCallbackRegistered: Record<string, boolean>
    electronAPI: {
      handleStartStopRecording: (callback: () => void) => void
      handleOpenSettings: (callback: () => void) => void
      registerGlobalShortcut: (shortcutString: string | null) => Promise<boolean>
    }
  }
}

export async function sleep (milisecs: number): Promise<void> {
  return await new Promise((resolve) => {
    if (milisecs === 0) {
      return resolve()
    }
    setTimeout(resolve, milisecs)
  })
}

export function promptFile (contentType: string, multiple: boolean): Promise<File | File[]> {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = multiple
  input.accept = contentType
  return new Promise(function (resolve, reject) {
    input.onchange = function () {
      if (input.files == null) {
        reject(new Error('file is null'))
        return
      }

      const files = Array.from(input.files)
      if (multiple) {
        return resolve(files)
      }
      resolve(files[0])
    }
    input.click()
  })
}
