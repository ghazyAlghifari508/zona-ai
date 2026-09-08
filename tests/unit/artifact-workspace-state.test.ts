import { describe, expect, it } from 'vitest'
import {
  artifactVersionKey,
  closeArtifactPanel,
  closeArtifactTab,
  createInitialArtifactWorkspace,
  openArtifact,
  rememberArtifactScroll,
  resetArtifactWorkspace,
  selectArtifactVersion,
} from '../../src/lib/artifacts/workspace-state'

const ART_A = '11111111-1111-4111-8111-111111111111'
const ART_B = '22222222-2222-4222-8222-222222222222'
const ART_C = '33333333-3333-4333-8333-333333333333'
const VER_A1 = 'a0000000-0000-4000-8000-000000000001'
const VER_A2 = 'a0000000-0000-4000-8000-000000000002'
const VER_B1 = 'b0000000-0000-4000-8000-000000000001'

describe('artifact workspace state', () => {
  it('opens a new artifact as active tab and opens the panel', () => {
    const next = openArtifact(createInitialArtifactWorkspace(), {
      artifactId: ART_A,
      versionId: VER_A1,
    })
    expect(next.openArtifactIds).toEqual([ART_A])
    expect(next.activeArtifactId).toBe(ART_A)
    expect(next.activeVersionByArtifactId[ART_A]).toBe(VER_A1)
    expect(next.isArtifactPanelOpen).toBe(true)
  })

  it('dedupes opening the same artifact without appending a duplicate tab', () => {
    const opened = openArtifact(createInitialArtifactWorkspace(), {
      artifactId: ART_A,
      versionId: VER_A1,
    })
    const again = openArtifact(opened, {
      artifactId: ART_A,
      versionId: VER_A1,
    })
    expect(again.openArtifactIds).toEqual([ART_A])
    expect(again.activeArtifactId).toBe(ART_A)
  })

  it('focuses an already-open artifact and updates active version when explicitly requested', () => {
    const first = openArtifact(createInitialArtifactWorkspace(), {
      artifactId: ART_A,
      versionId: VER_A1,
    })
    const withB = openArtifact(first, {
      artifactId: ART_B,
      versionId: VER_B1,
    })
    expect(withB.activeArtifactId).toBe(ART_B)
    const refocus = openArtifact(withB, {
      artifactId: ART_A,
      versionId: VER_A2,
    })
    expect(refocus.openArtifactIds).toEqual([ART_A, ART_B])
    expect(refocus.activeArtifactId).toBe(ART_A)
    expect(refocus.activeVersionByArtifactId[ART_A]).toBe(VER_A2)
  })

  it('keeps existing active version when reopening without an explicit version', () => {
    const first = openArtifact(createInitialArtifactWorkspace(), {
      artifactId: ART_A,
      versionId: VER_A1,
    })
    const withB = openArtifact(first, {
      artifactId: ART_B,
      versionId: VER_B1,
    })
    const refocus = openArtifact(withB, { artifactId: ART_A })
    expect(refocus.openArtifactIds).toEqual([ART_A, ART_B])
    expect(refocus.activeArtifactId).toBe(ART_A)
    expect(refocus.activeVersionByArtifactId[ART_A]).toBe(VER_A1)
  })

  it('selects a version for an open artifact', () => {
    const opened = openArtifact(createInitialArtifactWorkspace(), {
      artifactId: ART_A,
      versionId: VER_A1,
    })
    const next = selectArtifactVersion(opened, {
      artifactId: ART_A,
      versionId: VER_A2,
    })
    expect(next.activeVersionByArtifactId[ART_A]).toBe(VER_A2)
    expect(next.activeArtifactId).toBe(ART_A)
  })

  it('keys scroll positions by artifact and version', () => {
    const opened = openArtifact(createInitialArtifactWorkspace(), {
      artifactId: ART_A,
      versionId: VER_A1,
    })
    const scrolled = rememberArtifactScroll(opened, {
      artifactId: ART_A,
      versionId: VER_A1,
      scrollTop: 120,
    })
    expect(scrolled.scrollTopByVersionKey[`${ART_A}:${VER_A1}`]).toBe(120)
    expect(artifactVersionKey(ART_A, VER_A1)).toBe(`${ART_A}:${VER_A1}`)
    const otherVersion = rememberArtifactScroll(scrolled, {
      artifactId: ART_A,
      versionId: VER_A2,
      scrollTop: 40,
    })
    expect(otherVersion.scrollTopByVersionKey[`${ART_A}:${VER_A2}`]).toBe(40)
    expect(otherVersion.scrollTopByVersionKey[`${ART_A}:${VER_A1}`]).toBe(120)
  })

  it('selects a neighbor tab when closing the active tab', () => {
    let state = createInitialArtifactWorkspace()
    state = openArtifact(state, { artifactId: ART_A, versionId: VER_A1 })
    state = openArtifact(state, { artifactId: ART_B, versionId: VER_B1 })
    state = openArtifact(state, {
      artifactId: ART_C,
      versionId: VER_A1,
    })
    expect(state.activeArtifactId).toBe(ART_C)
    const closed = closeArtifactTab(state, ART_C)
    expect(closed.openArtifactIds).toEqual([ART_A, ART_B])
    expect(closed.activeArtifactId).toBe(ART_B)
    expect(closed.isArtifactPanelOpen).toBe(true)
  })

  it('closes the panel when the last tab closes', () => {
    const opened = openArtifact(createInitialArtifactWorkspace(), {
      artifactId: ART_A,
      versionId: VER_A1,
    })
    const closed = closeArtifactTab(opened, ART_A)
    expect(closed.openArtifactIds).toEqual([])
    expect(closed.activeArtifactId).toBeNull()
    expect(closed.isArtifactPanelOpen).toBe(false)
  })

  it('keeps tabs when closing the panel', () => {
    let state = createInitialArtifactWorkspace()
    state = openArtifact(state, { artifactId: ART_A, versionId: VER_A1 })
    state = openArtifact(state, { artifactId: ART_B, versionId: VER_B1 })
    const closed = closeArtifactPanel(state)
    expect(closed.isArtifactPanelOpen).toBe(false)
    expect(closed.openArtifactIds).toEqual([ART_A, ART_B])
    expect(closed.activeArtifactId).toBe(ART_B)
    expect(closed.activeVersionByArtifactId[ART_A]).toBe(VER_A1)
  })

  it('resets workspace state for a new conversation', () => {
    let state = createInitialArtifactWorkspace()
    state = openArtifact(state, { artifactId: ART_A, versionId: VER_A1 })
    state = rememberArtifactScroll(state, {
      artifactId: ART_A,
      versionId: VER_A1,
      scrollTop: 99,
    })
    const reset = resetArtifactWorkspace()
    expect(reset.openArtifactIds).toEqual([])
    expect(reset.activeArtifactId).toBeNull()
    expect(reset.activeVersionByArtifactId).toEqual({})
    expect(reset.scrollTopByVersionKey).toEqual({})
    expect(reset.isArtifactPanelOpen).toBe(false)
  })

  it('does not mutate the input state', () => {
    const initial = createInitialArtifactWorkspace()
    const snapshot = structuredClone(initial)
    openArtifact(initial, { artifactId: ART_A, versionId: VER_A1 })
    expect(initial).toEqual(snapshot)
  })
})
