const OPENAI_LOGO_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'

const XIAOMI_LOGO_PATH =
  'M12 0C8.016 0 4.756.255 2.493 2.516.23 4.776 0 8.033 0 12.012c0 3.98.23 7.235 2.494 9.497C4.757 23.77 8.017 24 12 24c3.983 0 7.243-.23 9.506-2.491C23.77 19.247 24 15.99 24 12.012c0-3.984-.233-7.243-2.502-9.504C19.234.252 15.978 0 12 0zM4.906 7.405h5.624c1.47 0 3.007.068 3.764.827.746.746.827 2.233.83 3.676v4.54a.15.15 0 0 1-.152.147h-1.947a.15.15 0 0 1-.152-.148V11.83c-.002-.806-.048-1.634-.464-2.051-.358-.36-1.026-.441-1.72-.458H7.158a.15.15 0 0 0-.151.147v6.98a.15.15 0 0 1-.152.148H4.906a.15.15 0 0 1-.15-.148V7.554a.15.15 0 0 1 .15-.149zm12.131 0h1.949a.15.15 0 0 1 .15.15v8.892a.15.15 0 0 1-.15.148h-1.949a.15.15 0 0 1-.151-.148V7.554a.15.15 0 0 1 .151-.149zM8.92 10.948h2.046c.083 0 .15.066.15.147v5.352a.15.15 0 0 1-.15.148H8.92a.15.15 0 0 1-.152-.148v-5.352a.15.15 0 0 1 .152-.147Z'

const ZHIPU_BG_PATH =
  'M24.51 28.51H5.49c-2.21 0-4-1.79-4-4V5.49c0-2.21 1.79-4 4-4h19.03c2.21 0 4 1.79 4 4v19.03c0 2.2-1.79 3.99-4 3.99z'
const ZHIPU_TOP_PATH =
  'M15.47 7.1l-1.3 1.85c-.2.29-.54.47-.9.47H6.16V7.09h9.31z'
const ZHIPU_DIAGONAL_POINTS = '24.3,7.1 13.14,22.91 5.7,22.91 16.86,7.1'
const ZHIPU_BOTTOM_PATH =
  'M14.53 22.91l1.31-1.86c.2-.29.54-.47.9-.47h7.09v2.33h-9.3z'

export function ProviderIcon({
  provider,
  size = 16,
  inverted = false,
}: {
  provider: string
  size?: number
  inverted?: boolean
}) {
  if (provider === 'codex' || provider === 'openai') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
      >
        <title>OpenAI</title>
        <path d={OPENAI_LOGO_PATH} />
      </svg>
    )
  }
  if (
    provider === 'antigravity' ||
    provider === 'google' ||
    provider === 'gemini'
  ) {
    return (
      <img
        src="/assets/google-gemini.svg"
        alt="Google Gemini"
        width={size}
        height={size}
        className="pointer-events-none block object-contain"
      />
    )
  }
  if (provider === 'qwen') {
    return (
      <img
        src="/assets/qwen.svg"
        alt="Qwen"
        width={size}
        height={size}
        className="pointer-events-none block object-contain"
      />
    )
  }
  if (provider === 'mimo') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        role="img"
        aria-hidden="true"
        className="pointer-events-none block"
      >
        <title>MiMo</title>
        <path fill="#FF6900" d={XIAOMI_LOGO_PATH} />
      </svg>
    )
  }
  if (provider === 'hunyuan' || provider === 'hy') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        role="img"
        aria-hidden="true"
        className="pointer-events-none block"
      >
        <title>Hunyuan</title>
        <circle cx="12" cy="12" fill="#0055E9" r="12" />
        <path
          d="M12 0c.518 0 1.028.033 1.528.096A6.188 6.188 0 0112.12 12.28l-.12.001c-2.99 0-5.242 2.179-5.554 5.11-.223 2.086.353 4.412 2.242 6.146C3.672 22.1 0 17.479 0 12 0 5.373 5.373 0 12 0z"
          fill="#A8DFF5"
        />
        <path
          d="M5.286 5a2.438 2.438 0 01.682 3.38c-3.962 5.966-3.215 10.743 2.648 15.136C3.636 22.056 0 17.452 0 12c0-1.787.39-3.482 1.09-5.006.253-.435.525-.872.817-1.311A2.438 2.438 0 015.286 5z"
          fill="#0055E9"
        />
        <path
          d="M12.98.04c.272.021.543.053.81.093.583.106 1.117.254 1.538.44 6.638 2.927 8.07 10.052 1.748 15.642a4.125 4.125 0 01-5.822-.358c-1.51-1.706-1.3-4.184.357-5.822.858-.848 3.108-1.223 4.045-2.441 1.257-1.634 2.122-6.009-2.523-7.506L12.98.039z"
          fill="#00BCFF"
        />
        <path
          d="M13.528.096A6.187 6.187 0 0112 12.281a5.75 5.75 0 00-1.71.255c.147-.905.595-1.784 1.321-2.501.858-.848 3.108-1.223 4.045-2.441 1.27-1.651 2.14-6.104-2.676-7.554.184.014.367.033.548.056z"
          fill="#ECECEE"
        />
      </svg>
    )
  }
  if (provider === 'glm' || provider === 'zhipu') {
    return (
      <svg
        viewBox="0 0 30 30"
        width={size}
        height={size}
        role="img"
        aria-hidden="true"
        className="pointer-events-none block"
      >
        <title>GLM</title>
        <path fill="#2D2D2D" d={ZHIPU_BG_PATH} />
        <path fill="#FFFFFF" d={ZHIPU_TOP_PATH} />
        <polygon fill="#FFFFFF" points={ZHIPU_DIAGONAL_POINTS} />
        <path fill="#FFFFFF" d={ZHIPU_BOTTOM_PATH} />
      </svg>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`text-[11px] leading-none font-bold ${
        inverted ? 'text-pure-white' : 'text-ink'
      }`}
    >
      A
    </span>
  )
}
