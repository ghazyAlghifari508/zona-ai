import { Coins01Icon, Pulse01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type React from 'react'
import { useId, useMemo, useState } from 'react'
import type { DailyMetricPoint } from '../../server/core/admin-dashboard'

interface AdminActivityChartProps {
  data: DailyMetricPoint[]
}

type TimeRange = '7d' | '14d' | '30d'
type MetricType = 'credits' | 'transactions'

export function AdminActivityChart({ data }: AdminActivityChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const [metric, setMetric] = useState<MetricType>('credits')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const gradientId = useId()

  const slicedData = useMemo(() => {
    if (!data || data.length === 0) return []
    const count = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30
    return data.slice(-count)
  }, [data, timeRange])

  const { points, maxValue, totalInPeriod, avgPerDay, peakPoint } =
    useMemo(() => {
      if (slicedData.length === 0) {
        return {
          points: [],
          maxValue: 10,
          totalInPeriod: 0,
          avgPerDay: 0,
          peakPoint: null,
        }
      }

      const values = slicedData.map((d) =>
        metric === 'credits' ? d.creditsUsed : d.transactionsCount,
      )
      const max = Math.max(...values, 5)
      const total = values.reduce((sum, v) => sum + v, 0)
      const avg = Math.round(total / values.length)

      let peakIdx = 0
      let maxVal = -1
      for (let i = 0; i < values.length; i++) {
        const val = values[i] ?? 0
        if (val > maxVal) {
          maxVal = val
          peakIdx = i
        }
      }

      return {
        points: slicedData,
        maxValue: max,
        totalInPeriod: total,
        avgPerDay: avg,
        peakPoint: slicedData[peakIdx] ?? null,
      }
    }, [slicedData, metric])

  // SVG dimensions
  const svgWidth = 760
  const svgHeight = 150
  const padLeft = 38
  const padRight = 16
  const padTop = 14
  const padBottom = 26

  const chartWidth = svgWidth - padLeft - padRight
  const chartHeight = svgHeight - padTop - padBottom

  const coordinates = useMemo(() => {
    if (points.length === 0) return []
    return points.map((p, idx) => {
      const x =
        points.length === 1
          ? padLeft + chartWidth / 2
          : padLeft + (idx / (points.length - 1)) * chartWidth
      const val = metric === 'credits' ? p.creditsUsed : p.transactionsCount
      const y = padTop + chartHeight - (val / maxValue) * chartHeight
      return { x, y, point: p, val }
    })
  }, [points, chartWidth, chartHeight, maxValue, metric])

  const linePath = useMemo(() => {
    if (coordinates.length === 0) return ''
    return coordinates.reduce((acc, curr, idx) => {
      return idx === 0
        ? `M ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`
        : `${acc} L ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`
    }, '')
  }, [coordinates])

  const areaPath = useMemo(() => {
    if (coordinates.length === 0) return ''
    const baseline = padTop + chartHeight
    const first = coordinates[0]
    const last = coordinates[coordinates.length - 1]
    if (!first || !last) return ''
    return `${linePath} L ${last.x.toFixed(1)},${baseline.toFixed(1)} L ${first.x.toFixed(1)},${baseline.toFixed(1)} Z`
  }, [coordinates, linePath, chartHeight])

  const activeCoord =
    hoveredIndex !== null ? (coordinates[hoveredIndex] ?? null) : null

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || coordinates.length === 0) return
    const mouseX = e.clientX - rect.left
    const relativeX = (mouseX / rect.width) * svgWidth

    if (relativeX < padLeft - 10 || relativeX > svgWidth - padRight + 10) {
      setHoveredIndex(null)
      return
    }

    let closestIdx = 0
    let minDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i]
      if (!coord) continue
      const dist = Math.abs(coord.x - relativeX)
      if (dist < minDist) {
        minDist = dist
        closestIdx = i
      }
    }
    setHoveredIndex(closestIdx)
  }

  return (
    <div
      data-testid="admin-activity-chart"
      className="rounded-lg border border-hairline bg-pure-white p-5 shadow-xs"
    >
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            Analisis Aktivitas Penggunaan
          </h2>
          <p className="mt-0.5 text-[12px] text-stone">
            Tren konsumsi kuota kredit dan transaksi interaksi model AI dalam
            ekosistem ZonaAI.
          </p>
        </div>

        {/* Range & Metric Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Toggle */}
          <div className="flex rounded-md border border-hairline bg-paper p-0.5 text-[11px]">
            <button
              type="button"
              data-testid="admin-chart-metric-credits"
              onClick={() => setMetric('credits')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-all ${
                metric === 'credits'
                  ? 'bg-pure-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-stone hover:text-ink'
              }`}
            >
              <HugeiconsIcon icon={Coins01Icon} size={12} strokeWidth={1.75} />
              <span>Kredit</span>
            </button>
            <button
              type="button"
              data-testid="admin-chart-metric-transactions"
              onClick={() => setMetric('transactions')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-all ${
                metric === 'transactions'
                  ? 'bg-pure-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-stone hover:text-ink'
              }`}
            >
              <HugeiconsIcon icon={Pulse01Icon} size={12} strokeWidth={1.75} />
              <span>Aktivitas</span>
            </button>
          </div>

          {/* Time Range Pills */}
          <div className="flex rounded-md border border-hairline bg-paper p-0.5 text-[11px]">
            {(['7d', '14d', '30d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                data-testid={`admin-chart-filter-${r}`}
                onClick={() => setTimeRange(r)}
                className={`rounded px-2.5 py-1 font-medium transition-all ${
                  timeRange === r
                    ? 'bg-pure-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                    : 'text-stone hover:text-ink'
                }`}
              >
                {r === '7d' ? '7 Hari' : r === '14d' ? '14 Hari' : '30 Hari'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Period Summary Badges */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-hairline py-2.5 text-xs">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-stone">
            Total Periode (
            {timeRange === '7d'
              ? '7 Hari'
              : timeRange === '14d'
                ? '14 Hari'
                : '30 Hari'}
            ):
          </span>
          <span className="font-semibold text-ink">
            {new Intl.NumberFormat('id-ID').format(totalInPeriod)}{' '}
            <span className="font-normal text-[11px] text-stone">
              {metric === 'credits' ? 'kredit' : 'transaksi'}
            </span>
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-stone">Rata-rata Harian:</span>
          <span className="font-semibold text-ink">
            {new Intl.NumberFormat('id-ID').format(avgPerDay)}{' '}
            <span className="font-normal text-[11px] text-stone">/ hari</span>
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-stone">Puncak Tertinggi:</span>
          <span className="font-semibold text-ink">
            {peakPoint
              ? `${new Intl.NumberFormat('id-ID').format(
                  metric === 'credits'
                    ? peakPoint.creditsUsed
                    : peakPoint.transactionsCount,
                )} (${peakPoint.label})`
              : '-'}
          </span>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative mt-4 w-full">
        {/* Hover Tooltip Overlay */}
        {activeCoord && (
          <div
            className="pointer-events-none absolute top-1 z-20 -translate-x-1/2 rounded-md border border-hairline bg-pure-white px-3 py-1.5 shadow-xs transition-all duration-150"
            style={{
              left: `${(activeCoord.x / svgWidth) * 100}%`,
            }}
          >
            <p className="text-[11px] font-medium text-stone">
              {activeCoord.point.label}
            </p>
            <p className="text-[13px] font-bold text-ink">
              {new Intl.NumberFormat('id-ID').format(activeCoord.val)}{' '}
              <span className="text-[11px] font-normal text-stone">
                {metric === 'credits' ? 'Kredit Terpakai' : 'Aktivitas'}
              </span>
            </p>
          </div>
        )}

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-48 w-full overflow-visible select-none sm:h-56 cursor-crosshair"
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={() => setHoveredIndex(null)}
          role="img"
          aria-label="Grafik Analisis Aktivitas Penggunaan"
        >
          <title>Grafik Analisis Aktivitas Penggunaan</title>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0075de" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0075de" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines (hairlines) */}
          {[0, 0.5, 1].map((ratio) => {
            const y = padTop + chartHeight * (1 - ratio)
            const labelVal = Math.round(maxValue * ratio)
            return (
              <g key={ratio}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-hairline"
                  strokeDasharray={ratio === 0 ? 'none' : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-stone font-mono text-[10px]"
                >
                  {labelVal}
                </text>
              </g>
            )
          })}

          {/* Area Fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={`url(#${gradientId})`}
              className="transition-all duration-300"
            />
          )}

          {/* Main Trend Line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#0075de"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-all duration-300"
            />
          )}

          {/* Interactive Crosshair & Cursor Point */}
          {activeCoord && (
            <g>
              <line
                x1={activeCoord.x}
                y1={padTop}
                x2={activeCoord.x}
                y2={padTop + chartHeight}
                stroke="#0075de"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={activeCoord.x}
                cy={activeCoord.y}
                r="4.5"
                fill="#0075de"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

          {/* X-axis Labels */}
          {coordinates.map((coord, idx) => {
            const step = timeRange === '7d' ? 1 : timeRange === '14d' ? 2 : 4
            const showLabel = idx % step === 0 || idx === coordinates.length - 1

            return (
              <g key={coord.point.date}>
                {showLabel && (
                  <text
                    x={coord.x}
                    y={svgHeight - 10}
                    textAnchor="middle"
                    className="fill-stone text-[10px]"
                  >
                    {coord.point.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
