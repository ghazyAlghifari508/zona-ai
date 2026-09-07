export type ArtifactWorkspaceState = {
  openArtifactIds: string[]
  activeArtifactId: string | null
  activeVersionByArtifactId: Record<string, string>
  scrollTopByVersionKey: Record<string, number>
  isArtifactPanelOpen: boolean
}

export function createInitialArtifactWorkspace(): ArtifactWorkspaceState {
  return {
    openArtifactIds: [],
    activeArtifactId: null,
    activeVersionByArtifactId: {},
    scrollTopByVersionKey: {},
    isArtifactPanelOpen: false,
  }
}

export function artifactVersionKey(
  artifactId: string,
  versionId: string,
): string {
  return `${artifactId}:${versionId}`
}

export function openArtifact(
  state: ArtifactWorkspaceState,
  input: { artifactId: string; versionId?: string },
): ArtifactWorkspaceState {
  const isOpen = state.openArtifactIds.includes(input.artifactId)
  const openArtifactIds = isOpen
    ? [...state.openArtifactIds]
    : [...state.openArtifactIds, input.artifactId]
  const activeVersionByArtifactId = { ...state.activeVersionByArtifactId }
  if (input.versionId !== undefined) {
    activeVersionByArtifactId[input.artifactId] = input.versionId
  } else if (!isOpen) {
    delete activeVersionByArtifactId[input.artifactId]
  }
  return {
    openArtifactIds,
    activeArtifactId: input.artifactId,
    activeVersionByArtifactId,
    scrollTopByVersionKey: { ...state.scrollTopByVersionKey },
    isArtifactPanelOpen: true,
  }
}

export function selectArtifactVersion(
  state: ArtifactWorkspaceState,
  input: { artifactId: string; versionId: string },
): ArtifactWorkspaceState {
  const isOpen = state.openArtifactIds.includes(input.artifactId)
  return {
    openArtifactIds: [...state.openArtifactIds],
    activeArtifactId: isOpen ? input.artifactId : state.activeArtifactId,
    activeVersionByArtifactId: {
      ...state.activeVersionByArtifactId,
      [input.artifactId]: input.versionId,
    },
    scrollTopByVersionKey: { ...state.scrollTopByVersionKey },
    isArtifactPanelOpen: state.isArtifactPanelOpen,
  }
}

export function rememberArtifactScroll(
  state: ArtifactWorkspaceState,
  input: { artifactId: string; versionId: string; scrollTop: number },
): ArtifactWorkspaceState {
  return {
    openArtifactIds: [...state.openArtifactIds],
    activeArtifactId: state.activeArtifactId,
    activeVersionByArtifactId: { ...state.activeVersionByArtifactId },
    scrollTopByVersionKey: {
      ...state.scrollTopByVersionKey,
      [artifactVersionKey(input.artifactId, input.versionId)]: input.scrollTop,
    },
    isArtifactPanelOpen: state.isArtifactPanelOpen,
  }
}

export function closeArtifactTab(
  state: ArtifactWorkspaceState,
  artifactId: string,
): ArtifactWorkspaceState {
  const index = state.openArtifactIds.indexOf(artifactId)
  if (index === -1)
    return {
      ...state,
      openArtifactIds: [...state.openArtifactIds],
      activeVersionByArtifactId: { ...state.activeVersionByArtifactId },
      scrollTopByVersionKey: { ...state.scrollTopByVersionKey },
    }
  const openArtifactIds = state.openArtifactIds.filter(
    (id) => id !== artifactId,
  )
  const activeVersionByArtifactId = { ...state.activeVersionByArtifactId }
  delete activeVersionByArtifactId[artifactId]
  if (openArtifactIds.length === 0) {
    return {
      openArtifactIds,
      activeArtifactId: null,
      activeVersionByArtifactId,
      scrollTopByVersionKey: { ...state.scrollTopByVersionKey },
      isArtifactPanelOpen: false,
    }
  }
  const wasActive = state.activeArtifactId === artifactId
  let activeArtifactId = state.activeArtifactId
  if (wasActive) {
    const neighborIndex = index > 0 ? index - 1 : 0
    const neighborId =
      state.openArtifactIds[
        neighborIndex === index ? neighborIndex + 1 : neighborIndex
      ] ?? openArtifactIds[0]
    activeArtifactId = neighborId
  }
  return {
    openArtifactIds,
    activeArtifactId,
    activeVersionByArtifactId,
    scrollTopByVersionKey: { ...state.scrollTopByVersionKey },
    isArtifactPanelOpen: true,
  }
}

export function closeArtifactPanel(
  state: ArtifactWorkspaceState,
): ArtifactWorkspaceState {
  return {
    openArtifactIds: [...state.openArtifactIds],
    activeArtifactId: state.activeArtifactId,
    activeVersionByArtifactId: { ...state.activeVersionByArtifactId },
    scrollTopByVersionKey: { ...state.scrollTopByVersionKey },
    isArtifactPanelOpen: false,
  }
}

export function resetArtifactWorkspace(): ArtifactWorkspaceState {
  return createInitialArtifactWorkspace()
}
