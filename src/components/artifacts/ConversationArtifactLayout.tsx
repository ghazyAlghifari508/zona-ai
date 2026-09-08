import type { ReactNode } from 'react'

export type ConversationArtifactLayoutProps = {
  canvasOpen: boolean
  chatPane: ReactNode
  canvasPane: ReactNode
}

export function ConversationArtifactLayout({
  canvasOpen,
  chatPane,
  canvasPane,
}: ConversationArtifactLayoutProps) {
  return (
    <div
      data-testid="conversation-artifact-layout"
      data-canvas-open={canvasOpen}
      className={`grid h-full min-h-0 min-w-0 flex-1 overflow-hidden ${
        canvasOpen
          ? 'grid-cols-1 md:grid-cols-[minmax(0,11fr)_1px_minmax(0,9fr)]'
          : 'grid-cols-1'
      }`}
    >
      <div
        data-testid="chat-pane"
        className={`relative h-full min-h-0 min-w-0 overflow-hidden ${
          canvasOpen ? 'hidden md:flex md:flex-col' : 'flex flex-col'
        }`}
      >
        {chatPane}
      </div>
      {canvasOpen ? (
        <div
          data-testid="artifact-layout-separator"
          aria-hidden="true"
          className="hidden h-full w-px bg-hairline md:block"
        />
      ) : null}
      <div
        data-testid="canvas-pane"
        className={`h-full min-h-0 min-w-0 overflow-hidden ${
          canvasOpen ? 'flex flex-col' : 'hidden'
        }`}
      >
        {canvasPane}
      </div>
    </div>
  )
}
