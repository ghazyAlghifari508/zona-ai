import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { z } from "zod"
import { getAuthSession } from "../../lib/auth/session"
import { searchProvider } from "../../lib/tavily/client"

if (typeof window !== "undefined") {
  throw new Error("src/server/functions/search.ts is server-only")
}

const searchWebSchema = z.object({
  query: z.string().min(1).max(500),
  searchDepth: z.enum(["basic", "advanced"]).default("basic"),
})

export async function searchWebCore({
  data,
  request,
}: {
  data: z.infer<typeof searchWebSchema>
  request: Request
}) {
  await getAuthSession(request)
  try {
    const results = await searchProvider.search(data.query, {
      searchDepth: data.searchDepth,
    })
    return { results }
  } catch (e) {
    console.error("Tavily fail", e)
    return { results: [] }
  }
}

export const searchWeb = createServerFn({ method: "POST" })
  .validator((data: unknown) => searchWebSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return searchWebCore({
      data: data as z.infer<typeof searchWebSchema>,
      request,
    })
  })
