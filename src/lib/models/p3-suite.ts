import { z } from 'zod'
import { CREDIT_COST_BY_BARS } from '../utils/constants'

export const suiteVersion = 'zona-p3-v1'
export const defaultSeed = 32026
export const neutralSystem =
  'Solve the task independently. Return only the requested JSON value, without explanation.'
export const categories = {
  coding: 15,
  reasoning: 15,
  math: 9,
  instruction: 9,
  factual: 6,
  context: 6,
} as const
export const repetitions = 3
export const difficulty = ['easy', 'medium', 'hard'] as const
export type Category = keyof typeof categories

type Atom = string | number | boolean | null
type Answer = Atom | readonly Atom[] | Readonly<Record<string, Atom>>
type Task = readonly [string, Answer, string?]
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return (limit: number) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state % limit
  }
}

export function buildTextSuite(seed: number) {
  const draw = seededRandom(seed)
  const a = 4 + draw(27)
  const b = 2 + draw(13)
  const n = 50 + draw(91)
  const tasks: Record<Category, readonly Task[]> = {
    coding: [
      [
        `Trace JS: const x=[${a},${b}]; const y=x; y.push(0); return x.length. Return a number.`,
        3,
      ],
      [
        'What does JS `[9, 10, 2].sort()` return as a JSON array without a comparator?',
        [10, 2, 9],
      ],
      [
        'A binary search uses `while (left < right)` and never inspects the final candidate. For [4] searching 4, return [buggy result, corrected result], using -1 for not found.',
        [-1, 0],
      ],
      ['Return the two JS values `[null ?? 9, 0 || 9]` as JSON.', [9, 9]],
      [
        'Implement inclusive interval overlap mentally: for (1,3) and (3,5), then (1,2) and (3,5), return two booleans in order.',
        [true, false],
      ],
      [
        'For a directed graph A→B, A→C, B→D, C→D, C→E, E→A, count simple paths A→D and give a shortest path length in edges. Return [count,length].',
        [2, 2],
      ],
      [
        `JS: for(let i=${a};i<${a + 4};i+=2) s+=i; initially s=0. Return the final number.`,
        2 * a + 2,
      ],
      [
        'SQL fixture t(x): 1,NULL,1,2. Return [COUNT(*),COUNT(x),COUNT(DISTINCT x)] for t.',
        [4, 3, 2],
      ],
      [
        'Stable deduplication after case folding: input ["a","B","A","c","b"]. Preserve original spelling from first occurrence. Return an array.',
        ['a', 'B', 'c'],
      ],
      [
        'Given a stack initially [1] (top at right), operations push(2), pop, push(3), pop, pop. Return popped values in order.',
        [2, 3, 1],
      ],
      [
        'Find the longest contiguous strictly increasing run length for [3,1,2,2,3,4,1]. Return a number.',
        3,
      ],
      [
        'Capacity 2 LRU cache: access A,B,A,C,B,D,B. Return [hits, evictions, remaining oldest key] assuming empty initially.',
        [2, 3, 'D'],
      ],
      [
        'A half-open slice gets indices 1 to 3 exclusive. For [1,2,3,4], return the slice as JSON.',
        [2, 3],
      ],
      [
        'SQL tables A(k)=(1,1,2,NULL), B(k)=(1,1,3,NULL). A LEFT JOIN B ON A.k=B.k. Return [COUNT(*),COUNT(B.k)].',
        [6, 4],
      ],
      [
        'After topological sorting with alphabetical tie-break: edges C→A, B→A, A→D, B→E, E→D. Return the full order as a JSON array.',
        ['B', 'C', 'A', 'E', 'D'],
      ],
    ],
    reasoning: [
      [
        'N before L, L before R. Return their order as a JSON array.',
        ['N', 'L', 'R'],
      ],
      [
        'All amber tokens are round. No round tokens are heavy. A is amber. Is A heavy? Return a boolean.',
        false,
      ],
      [
        'Four slots: K immediately before M; T after M, V before K. Put all four in order. Return an array.',
        ['V', 'K', 'M', 'T'],
      ],
      [
        `A queue has ${a} people ahead of Sol and ${b} behind Sol. Return the total number including Sol.`,
        a + b + 1,
      ],
      [
        'If bell rings, door opens. Door is open. Is ringing logically necessary? Return a boolean.',
        false,
      ],
      [
        'Each of C,D,E has exactly one of red, green, blue. C is not green, D is not red, E is neither green nor blue, and C is not blue if D is blue. Return colors in C,D,E order.',
        ['blue', 'green', 'red'],
      ],
      [
        'A is to the left of B, B is to the left of C. Who is furthest right? Return a string.',
        'C',
      ],
      [
        'Rule: if A then B; if not C then not B. A is true. Return [B,C] as booleans.',
        [true, true],
      ],
      [
        'Exactly one of X,Y,Z is true. X says Y and Z are false; Y says X is false; Z says X and Y are true. Which statement is true? Return the string "impossible" if no assignment, or an array of all possible true speakers.',
        ['X', 'Y'],
      ],
      [
        'A task requires K first. L requires A to finish; K is finished, A is unfinished. Can L start? Return a boolean.',
        false,
      ],
      [
        'Three tokens have weights 2,4,7. A outweighs B; C is lighter than B. Return weights [A,B,C].',
        [7, 4, 2],
      ],
      [
        'A train stops once at each station. A before D, B between A and D, C between B and D, E before A. Return the unique order as an array.',
        ['E', 'A', 'B', 'C', 'D'],
      ],
      [
        'Every blue bead is glass. T is not glass. Is T blue? Return a boolean.',
        false,
      ],
      [
        'Some silver items are tall; no tall items are soft. Must some silver items be nonsoft? Return a boolean.',
        true,
      ],
      [
        'A job needs 2 hours, B needs 3 hours after A completes, C needs 4 hours starting independently, and D needs 1 hour after B and C. With unlimited workers, return [project duration, slack of C].',
        [6, 1],
      ],
    ],
    math: [
      [`Return ${a} + ${b} × 3 as a number.`, a + 3 * b],
      [
        `Starting at ${n}, increase by 20% then decrease by 20%. Return final value.`,
        n * 0.96,
      ],
      [
        'Two fair dice: given sum ≥ 10, what is the probability of doubles? Return a decimal.',
        1 / 3,
      ],
      [`Return x for 3x − ${b} = ${a * 3 - b}.`, a],
      [
        'For arithmetic sequence 3,7,11,… return the sum of the first 12 terms.',
        300,
      ],
      [
        'Tank A fills in 6 hours; a leak empties it in 9 hours at constant rates. How many hours to fill together from empty?',
        18,
      ],
      ['What is least common multiple of 18 and 24? Return a number.', 72],
      [
        'A box holds 4 red and 6 blue balls. Draw two without replacement. Probability exactly one red? Return decimal.',
        8 / 15,
      ],
      [
        'An account starts at 200 and grows 10% annually. After year 1, withdraw 20 before continuing. What is balance after year 3? Return number.',
        242,
      ],
    ],
    instruction: [
      ['Return a JSON object with only key id and integer 7.', { id: 7 }],
      [
        'Transform [" pear ","KIWI"," pear"] by trimming, lowercasing, deduplicating, then sorting. Return a JSON array.',
        ['kiwi', 'pear'],
      ],
      [
        `From values [${n},${n + 1},${n + 2},${n + 3}], keep indices 0 and 3. Return object {head,tail,gap} with head and tail the retained values and gap their numeric difference. No extra fields.`,
        { head: n, tail: n + 3, gap: 3 },
      ],
      ['Return only JSON null, not string "null".', null],
      [
        'From keys t,b,k exclude b, capitalise the rest, reverse their original order. Return an array.',
        ['K', 'T'],
      ],
      [
        'Return an object with only keys odd, even, unknown. Use counts of parity for inputs [2,-3,0,null,7], null is unknown. Use integers.',
        { odd: 2, even: 2, unknown: 1 },
      ],
      [
        'Return a JSON string with exactly the characters J, then hyphen, then Q.',
        'J-Q',
      ],
      [
        'Return an array containing boolean false, number 0, and string "0", exactly in that order.',
        [false, 0, '0'],
      ],
      [
        'Given records A:3; B:3; C:2; D:5; E:5. Keep values ≥3. Sort descending by value and descending by letter on ties; return only the first three letters in an array.',
        ['E', 'D', 'B'],
      ],
    ],
    factual: [
      ['Return the number of SI base units.', 7, 'BIPM SI Brochure, §2.3'],
      [
        'Return [atomic number of carbon, number of neutrons in carbon-14].',
        [6, 8],
        'IUPAC periodic table; carbon-14 nuclide notation',
      ],
      [
        'A card only says sample Q is blue. Return its specific chemical composition as a JSON string, or null if the evidence is insufficient.',
        null,
      ],
      [
        'Earth’s natural satellite: return its common English name as a JSON string.',
        'Moon',
        'NASA Science: Moon',
      ],
      [
        'What fraction of a degree is one arcminute? Return a decimal.',
        1 / 60,
        'BIPM SI Brochure, Table 8',
      ],
      [
        'An atlas lists a state capital in 1800 but does not name the state or give any current data. Can the current capital be established from the stated facts alone? Return boolean.',
        false,
      ],
    ],
    context: [
      [
        'Memo: Dock T has crate M. Dock R has crate L. Return the crate at Dock T as a string.',
        'M',
      ],
      [
        `Dispatch: Batch J went to East; moved from East to West at ${a}:00. Batch H stays at East. Return locations [J,H] after the move.`,
        ['West', 'East'],
      ],
      [
        'Draft: toll 10. Revision: toll 13 on days after release. Release was on day 4, and draft applies otherwise. Return toll for days 4 and 5 as an array.',
        [10, 13],
      ],
      [
        'File A notes Box Q contains blue cards. Number of cards is not stated. Return count, or JSON null if unstated.',
        null,
      ],
      [
        'Memo A uses P for East gate. Memo B uses P for ticket desk. In A, P closes today; in B, P closes tomorrow. Return [today location, tomorrow location].',
        ['East gate', 'ticket desk'],
      ],
      [
        'Log v1: T kept lead. Log v2 replaces v1: U takes lead after day 3; T stays lead through day 3. Log v3 changes assistant only from A to B for all days. Return [lead day 3, lead day 4, assistant day 1].',
        ['T', 'U', 'B'],
      ],
    ],
  }
  return Object.entries(tasks).flatMap(([key, rows]) => {
    const category = z.enum(categoriesKeys).parse(key)
    return rows.map(([prompt, expected, source = 'Zona.ai synthetic'], i) => ({
      id: `${category}-${i + 1}`,
      category,
      difficulty: difficulty[i % difficulty.length],
      repeat: i === 1 || i === 2,
      prompt,
      expected,
      source,
      seed,
      rubric:
        'JSON; atoms exact (strings trimmed and case-sensitive; numbers absolute tolerance 0.00001); one point distributed equally across required fields; wrong shape/keys or extra items score zero.',
    }))
  })
}

const categoriesKeys = [
  'coding',
  'reasoning',
  'math',
  'instruction',
  'factual',
  'context',
] as const
export type TextCase = ReturnType<typeof buildTextSuite>[number]
const atom = z.union([z.string(), z.number(), z.boolean(), z.null()])
const answer = z.union([atom, z.array(atom), z.record(z.string(), atom)])

function atomMatches(actual: Atom | undefined, expected: Atom) {
  if (typeof actual === 'number' && typeof expected === 'number')
    return Math.abs(actual - expected) <= 0.00001
  if (typeof actual === 'string' && typeof expected === 'string')
    return actual.trim() === expected
  return actual === expected
}

export function scoreAnswer(text: string, expected: Answer): number {
  let value: unknown
  try {
    value = JSON.parse(
      text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1'),
    )
  } catch {
    return 0
  }
  const parsed = answer.safeParse(value)
  if (!parsed.success) return 0
  const actual = parsed.data
  if (expected !== null && typeof expected === 'object') {
    if (
      actual === null ||
      typeof actual !== 'object' ||
      Array.isArray(actual) !== Array.isArray(expected)
    )
      return 0
    const fields = Object.entries(expected)
    const received = new Map<string, Atom>(Object.entries(actual))
    if (
      fields.length !== received.size ||
      fields.some(([key]) => !received.has(key))
    )
      return 0
    return (
      fields.filter(([key, correct]) => atomMatches(received.get(key), correct))
        .length / fields.length
    )
  }
  return actual === null || typeof actual !== 'object'
    ? Number(atomMatches(actual, expected))
    : 0
}

export const tierThresholds = { premium: 85, balanced: 65 }
export function classifyScore(raw: number) {
  if (!Number.isFinite(raw) || raw < 0 || raw > 100)
    throw new Error('Invalid text score')
  const bars =
    raw >= tierThresholds.premium ? 4 : raw >= tierThresholds.balanced ? 3 : 2
  const tier = bars === 4 ? 'premium' : bars === 3 ? 'balanced' : 'economy'
  return { bars, credit: CREDIT_COST_BY_BARS[bars], tier } as const
}

export function summarizeText(
  cases: readonly TextCase[],
  points: ReadonlyMap<string, number>,
) {
  const groups = categoriesKeys.map((category) => {
    const planned = cases.filter((item) => item.category === category)
    const valid = planned.flatMap((item) => {
      const point = points.get(item.id)
      return point !== undefined &&
        Number.isFinite(point) &&
        point >= 0 &&
        point <= 1
        ? [point]
        : []
    })
    const score =
      valid.length === categories[category]
        ? (100 * valid.reduce((a, b) => a + b, 0)) / categories[category]
        : null
    return { category, score, planned: planned.length, valid: valid.length }
  })
  const raw = groups.every((g) => g.score !== null)
    ? Math.min(
        100,
        groups.reduce(
          (total, g) => total + ((g.score ?? 0) * categories[g.category]) / 60,
          0,
        ),
      )
    : null
  return {
    groups,
    raw,
    display: raw === null ? null : Math.round(raw * 100) / 100,
    tier: raw === null ? null : classifyScore(raw),
  }
}
