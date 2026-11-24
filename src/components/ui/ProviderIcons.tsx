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

const CLAUDE_LOGO_PATH =
  'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z'

const GROK_LOGO_PATH =
  'M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815'

const META_LOGO_PATH =
  'M8.217 5.243C9.145 3.988 10.171 3 11.483 3 13.96 3 16 6.153 16.001 9.907c0 2.29-.986 3.725-2.757 3.725-1.543 0-2.395-.866-3.924-3.424l-.667-1.123-.118-.197a55 55 0 0 0-.53-.877l-1.178 2.08c-1.673 2.925-2.615 3.541-3.923 3.541C1.086 13.632 0 12.217 0 9.973 0 6.388 1.995 3 4.598 3q.477-.001.924.122c.31.086.611.22.913.407.577.359 1.154.915 1.782 1.714m1.516 2.224q-.378-.615-.727-1.133L9 6.326c.845-1.305 1.543-1.954 2.372-1.954 1.723 0 3.102 2.537 3.102 5.653 0 1.188-.39 1.877-1.195 1.877-.773 0-1.142-.51-2.61-2.87zM4.846 4.756c.725.1 1.385.634 2.34 2.001A212 212 0 0 0 5.551 9.3c-1.357 2.126-1.826 2.603-2.581 2.603-.777 0-1.24-.682-1.24-1.9 0-2.602 1.298-5.264 2.846-5.264q.137 0 .27.018'

const DEEPSEEK_LOGO_PATH =
  'M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 0 1-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 0 0-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 0 1-.465.137 9.597 9.597 0 0 0-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 0 0 1.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 0 1 1.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 0 1 .415-.287.302.302 0 0 1 .2.288.306.306 0 0 1-.31.307.303.303 0 0 1-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 0 1-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 0 1 .016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 0 1-.254-.078.253.253 0 0 1-.114-.358c.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z'

// Source: simple-icons (CC0-1.0), https://simple-icons.org/minimax
const MINIMAX_LOGO_PATH =
  'M11.43 3.92a.86.86 0 1 0-1.718 0v14.236a1.999 1.999 0 0 1-3.997 0V9.022a.86.86 0 1 0-1.718 0v3.87a1.999 1.999 0 0 1-3.997 0V11.49a.57.57 0 0 1 1.139 0v1.404a.86.86 0 0 0 1.719 0V9.022a1.999 1.999 0 0 1 3.997 0v9.134a.86.86 0 0 0 1.719 0V3.92a1.998 1.998 0 1 1 3.996 0v11.788a.57.57 0 1 1-1.139 0zm10.572 3.105a2 2 0 0 0-1.999 1.997v7.63a.86.86 0 0 1-1.718 0V3.923a1.999 1.999 0 0 0-3.997 0v16.16a.86.86 0 0 1-1.719 0V18.08a.57.57 0 1 0-1.138 0v2a1.998 1.998 0 0 0 3.996 0V3.92a.86.86 0 0 1 1.719 0v12.73a1.999 1.999 0 0 0 3.996 0V9.023a.86.86 0 1 1 1.72 0v6.686a.57.57 0 0 0 1.138 0V9.022a2 2 0 0 0-1.998-1.997'

export function ProviderIcon({
  provider,
  size = 16,
  inverted = false,
}: {
  provider: string
  size?: number
  inverted?: boolean
}) {
  const p = (provider || '').toLowerCase().trim()

  // 1. OpenAI / Codex
  if (p === 'codex' || p === 'openai' || p === 'chatgpt') {
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

  // 2. Anthropic Claude
  if (p === 'anthropic' || p === 'claude') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={inverted ? 'currentColor' : '#D97757'}
        aria-hidden="true"
      >
        <title>Anthropic Claude</title>
        <path d={CLAUDE_LOGO_PATH} fillRule="evenodd" />
      </svg>
    )
  }

  // 3. xAI Grok
  if (p === 'xai' || p === 'grok' || p === 'gcli') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
      >
        <title>xAI Grok</title>
        <path d={GROK_LOGO_PATH} fillRule="evenodd" />
      </svg>
    )
  }

  // 4. Google Gemini / Antigravity
  if (p === 'antigravity' || p === 'google' || p === 'gemini') {
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

  // 5. Qwen / Alibaba
  if (p === 'qwen' || p === 'alibaba') {
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

  // 6. Xiaomi / MiMo
  if (p === 'mimo' || p === 'xiaomi') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        role="img"
        aria-hidden="true"
        className="pointer-events-none block"
      >
        <title>Xiaomi MiMo</title>
        <path fill="#FF6900" d={XIAOMI_LOGO_PATH} />
      </svg>
    )
  }

  // 7. Tencent / Hunyuan
  if (p === 'hunyuan' || p === 'hy' || p === 'tencent') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        role="img"
        aria-hidden="true"
        className="pointer-events-none block"
      >
        <title>Tencent Hunyuan</title>
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

  // 8. Zhipu AI / GLM
  if (p === 'glm' || p === 'zhipu' || p === 'zhipu ai' || p === 'zhipuai') {
    return (
      <svg
        viewBox="0 0 30 30"
        width={size}
        height={size}
        role="img"
        aria-hidden="true"
        className="pointer-events-none block"
      >
        <title>Zhipu AI GLM</title>
        <path fill="#2D2D2D" d={ZHIPU_BG_PATH} />
        <path fill="#FFFFFF" d={ZHIPU_TOP_PATH} />
        <polygon fill="#FFFFFF" points={ZHIPU_DIAGONAL_POINTS} />
        <path fill="#FFFFFF" d={ZHIPU_BOTTOM_PATH} />
      </svg>
    )
  }

  // 9. DeepSeek
  if (p === 'deepseek' || p === 'cbai') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={inverted ? 'currentColor' : '#4D6BFE'}
        aria-hidden="true"
      >
        <title>DeepSeek</title>
        <path d={DEEPSEEK_LOGO_PATH} />
      </svg>
    )
  }

  // 10. Atria / Shanghai AI Lab
  if (
    p === 'atria' ||
    p === 'atria-asi' ||
    p === 'atria dawn preview' ||
    p === 'shanghai ai lab' ||
    p === 'shanghai-ai'
  ) {
    return (
      <img
        src="/assets/atria-logo.png"
        alt="Atria"
        width={size}
        height={size}
        className={
          inverted
            ? 'pointer-events-none block object-contain brightness-0 invert'
            : 'pointer-events-none block object-contain dark:brightness-0 dark:invert'
        }
      />
    )
  }

  // 11. Meta / Muse Spark / OpenCode
  if (
    p === 'meta' ||
    p === 'oc' ||
    p === 'muse' ||
    p === 'muse spark' ||
    p === 'spark'
  ) {
    return (
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill={inverted ? 'currentColor' : '#0081FB'}
        aria-hidden="true"
      >
        <title>Meta Muse Spark</title>
        <path d={META_LOGO_PATH} />
      </svg>
    )
  }

  // 10. Zona AI / Auto Router
  if (p === 'zona' || p === 'zona-router' || p === 'auto') {
    if (inverted) {
      return (
        <span
          className="relative inline-flex shrink-0 items-center justify-center pointer-events-none"
          style={{ width: size, height: size }}
        >
          <img
            src="/assets/zonaai-logo-white.png"
            alt="Zona.ai"
            width={size}
            height={size}
            className="h-full w-full shrink-0 object-contain dark:hidden"
          />
          <img
            src="/assets/zonaai-logo.png"
            alt="Zona.ai"
            width={size}
            height={size}
            className="hidden h-full w-full shrink-0 object-contain dark:block"
          />
        </span>
      )
    }

    return (
      <span
        className="relative inline-flex shrink-0 items-center justify-center pointer-events-none"
        style={{ width: size, height: size }}
      >
        <img
          src="/assets/zonaai-logo.png"
          alt="Zona.ai"
          width={size}
          height={size}
          className="h-full w-full shrink-0 object-contain dark:hidden"
        />
        <img
          src="/assets/zonaai-logo-white.png"
          alt="Zona.ai"
          width={size}
          height={size}
          className="hidden h-full w-full shrink-0 object-contain dark:block"
        />
      </span>
    )
  }

  // 12. MiniMax
  if (p === 'minimax' || p === 'minimaxi' || p === 'minimaxai') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
      >
        <title>MiniMax</title>
        <path d={MINIMAX_LOGO_PATH} />
      </svg>
    )
  }

  // 13. Inception Labs / Mercury — official brand assets from inceptionlabs.ai
  if (p === 'inception' || p === 'inception labs' || p === 'mercury') {
    return (
      <span
        className="relative inline-flex shrink-0 items-center justify-center pointer-events-none"
        style={{ width: size, height: size }}
      >
        <img
          src="/assets/inception-logo.png"
          alt="Inception Labs"
          width={size}
          height={size}
          className="h-full w-full shrink-0 object-contain dark:hidden"
        />
        <img
          src="/assets/inception-logo-white.png"
          alt="Inception Labs"
          width={size}
          height={size}
          className="hidden h-full w-full shrink-0 object-contain dark:block"
        />
      </span>
    )
  }

  // Pure neutral Microchip fallback (ZERO slop / ZERO sparkles)
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={inverted ? 'text-pure-white' : 'text-stone'}
    >
      <title>{provider || 'AI Model'}</title>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
    </svg>
  )
}
