export interface SnapCallbacks {
  onSuccess?: (result: unknown) => void
  onPending?: (result: unknown) => void
  onError?: (result: unknown) => void
  onClose?: () => void
}

export interface SnapApi {
  pay: (token: string, callbacks?: SnapCallbacks) => void
  hide?: () => void
}

declare global {
  interface Window {
    snap?: SnapApi
  }
}

const SNAP_JS_SANDBOX_URL = 'https://app.sandbox.midtrans.com/snap/snap.js'
const SNAP_JS_PRODUCTION_URL = 'https://app.midtrans.com/snap/snap.js'

export function getSnapJsUrl(isProduction: boolean): string {
  return isProduction ? SNAP_JS_PRODUCTION_URL : SNAP_JS_SANDBOX_URL
}

let pendingLoad: Promise<SnapApi> | null = null

export function loadSnapJs(
  clientKey: string,
  isProduction: boolean,
): Promise<SnapApi> {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('SNAP_REQUIRES_BROWSER'))
  if (window.snap) return Promise.resolve(window.snap)
  if (pendingLoad) return pendingLoad
  pendingLoad = new Promise<SnapApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = getSnapJsUrl(isProduction)
    script.dataset.clientKey = clientKey
    script.dataset.zonaSnap = 'true'
    script.onload = () => {
      if (window.snap) {
        resolve(window.snap)
      } else {
        pendingLoad = null
        reject(new Error('SNAP_SCRIPT_LOADED_WITHOUT_API'))
      }
    }
    script.onerror = () => {
      pendingLoad = null
      reject(new Error('SNAP_SCRIPT_FAILED'))
    }
    document.head.appendChild(script)
  })
  return pendingLoad
}
