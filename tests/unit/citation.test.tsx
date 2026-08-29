/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest"
import { describe, it, expect, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { CitationDrawer, type CitationSource } from "../../src/components/chat/CitationDrawer"

const mockSources: CitationSource[] = [
  {
    url: "https://example.com/article-1",
    title: "Understanding RAG Systems",
    snippet: "RAG combines retrieval...",
    position: 0,
    score: 0.95,
  },
  {
    url: "https://example.com/article-2",
    title: "AI Model Comparison Guide",
    snippet: "Comparing content",
    score: 0.88,
    position: 1,
  },
]

describe("CitationDrawer", () => {
  afterEach(() => cleanup())

  it("renders 2 sources with chips and drawer", () => {
    render(<CitationDrawer sources={mockSources} />)
    expect(screen.getByTestId("citation-chip-0").textContent).toContain("[1]")
    expect(screen.getByTestId("citation-chip-1").textContent).toContain("[2]")
    expect(screen.getByText("Sources (2)")).toBeInTheDocument()
    expect(screen.getByText("Understanding RAG Systems")).toBeInTheDocument()
    expect(screen.getByText("https://example.com/article-1")).toBeInTheDocument()
  })

  it("collapses and expands drawer", () => {
    render(<CitationDrawer sources={mockSources} />)
    const toggle = screen.getByTestId("citation-toggle")
    const drawer = screen.getByTestId("citation-drawer")
    expect(drawer).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByTestId("citation-drawer")).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByTestId("citation-drawer")).toBeInTheDocument()
  })

  it("renders nothing when no sources", () => {
    const { container } = render(<CitationDrawer sources={[]} />)
    expect(container.innerHTML).toBe("")
  })

  it("chips are clickable links", () => {
    render(<CitationDrawer sources={mockSources} />)
    const chip = screen.getByTestId("citation-chip-0")
    expect(chip.getAttribute("href")).toBe("https://example.com/article-1")
    expect(chip.getAttribute("target")).toBe("_blank")
  })
})
