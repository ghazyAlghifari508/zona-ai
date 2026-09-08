# Zona.ai - Bounded Process Execution Rules

## Core Principle

**NEVER run an unbounded command.** Every process must be classified as finite or long-lived before it starts, given an explicit lifecycle, and cleaned up when it completes, fails, times out, or is cancelled.

These rules apply to Bun, Node.js, Vite, Vitest, Playwright, package managers, database tools, browser automation, and every child process they spawn.

---

## Rule 1: Every Finite Command Has a Deadline

Finite commands include installs, type checks, lint checks, builds, migrations, test runs, test discovery, and one-off scripts.

1. Set an explicit wall-clock timeout on every shell/tool call. Never rely on a tool's implicit or unlimited default.
2. Choose a realistic finite budget before starting and state it in the progress update for commands expected to take more than one minute.
3. Stream `stdout` and `stderr`; do not hide output in a pipe that is read only after process exit.
4. A timeout is a failed run, not permission to leave the process alive or claim that the command passed.
5. Do not immediately retry the same command after a timeout. Inspect the process tree, open ports, last output, environment propagation, and child-process state first.
6. Split broad gates into bounded stages: discovery/collection, affected tests, one E2E file/project, then the full suite only after focused runs pass.

Suggested maximum budgets are starting points, not permission to wait indefinitely:

| Command class | Initial timeout |
|---|---:|
| Status, diff, search, collection/list | 15-30 seconds |
| Typecheck, lint, focused unit/integration test | 60-120 seconds |
| Install, build, focused E2E | 2-5 minutes |
| Full Vitest or Playwright gate | 10 minutes, with visible progress |

If evidence shows a legitimate run needs more time, increase the next run's explicit timeout and record why. Never replace a finite timeout with infinity.

---

## Rule 2: Long-Lived Commands Are Managed Services

`bun run dev`, Vite, watch mode, Playwright UI mode, and similar commands are intentionally non-terminating. Never invoke them as ordinary commands and wait for exit.

For every long-lived process:

1. Start it separately and capture its PID.
2. Record the exact command, working directory, expected port, and owner task.
3. Poll a concrete readiness condition with a finite deadline, such as a listening port plus a successful HTTP response.
4. Run dependent work only after readiness succeeds.
5. Put cleanup in a `finally` path so success, failure, timeout, cancellation, and interrupted subagents all stop the process tree.
6. Verify cleanup by proving the PID tree is gone and the expected port is no longer listening.
7. Never leave a development server running merely to make a later command faster.

Subagents must not own long-lived servers when cancellation can hide their cleanup. Prefer controller-owned server lifecycle or a runner that starts the server, waits for readiness, runs one bounded action, and always tears the server down.

---

## Rule 3: Kill the Verified Process Tree on Windows

Stopping only the parent Bun process can leave Vite, Node.js, browsers, or test workers alive. On Windows:

1. Inspect ownership first with `Get-CimInstance Win32_Process` and confirm PID, parent PID, command line, and workspace path.
2. Inspect listeners with `Get-NetTCPConnection` when the process owns a server port.
3. Terminate only the verified tree with `taskkill /PID <pid> /T /F`.
4. Re-check the process tree and port after termination.

Never use broad commands such as `taskkill /IM bun.exe /F`, `taskkill /IM node.exe /F`, or mass `Stop-Process` calls. Other agents and the user may own unrelated processes.

`proc.kill()` alone is not accepted as Windows tree cleanup unless follow-up evidence proves all descendants exited.

---

## Rule 4: Bun Child Wrappers Need a Watchdog

`await proc.exited` is safe only when a watchdog owns the deadline and cleanup. A finite Bun wrapper must:

1. Spawn with `stdin`, `stdout`, and `stderr` inherited when interactive input is not required.
2. Pass the intended environment explicitly, for example `env: process.env`, without printing secrets.
3. Start a timeout before awaiting `proc.exited`.
4. On timeout, terminate the verified process tree and return a non-zero exit status.
5. Clear the watchdog in `finally`.

Do not wrap `bun run dev`, watch mode, or another long-lived process in a bare `await proc.exited` call.

Environment wrappers must verify propagation at the process boundary without dumping values. Report only whether required variable names are set or missing. If Playwright's `webServer` does not inherit the required environment, start the server explicitly under the managed-service rules instead of repeatedly waiting for Playwright's readiness timeout.

---

## Rule 5: Playwright and Browser Gates Are Incremental

1. Run `playwright test --list` first to catch collection and import failures quickly.
2. Debug with one spec, one project, `--workers=1`, and a streaming reporter.
3. Use condition-based waits and Playwright assertions; never add arbitrary sleeps to hide latency.
4. Run all projects only after the focused project passes.
5. Run the full suite once at the final gate, not after every edit.
6. If Playwright starts a web server, verify that cancellation tears it down. Check the configured port after every failed or cancelled run.
7. Preserve traces and failure output before cleanup; do not rerun blindly.

---

## Rule 6: Timeout Investigation Protocol

When a command reaches its deadline:

1. Capture the command, elapsed time, exit state, and final visible output.
2. Identify the parent and descendant processes.
3. Identify open ports and external boundaries being awaited.
4. Verify required environment variable names are present without exposing their values.
5. Kill the verified process tree and prove cleanup.
6. Form one root-cause hypothesis from evidence.
7. Run the smallest bounded probe that can confirm or reject it.

Common proven causes include a development server being treated as a finite command, a cancelled task leaving descendants alive, Playwright waiting for an unhealthy web server, missing environment propagation, an interactive prompt without a TTY, watch mode enabled accidentally, and open handles preventing test-runner exit.

---

## Rule 7: Progress and Completion Claims

1. Before a run longer than one minute, state the command scope and timeout.
2. For staged verification, report each completed stage rather than remaining silent until the broad gate ends.
3. Never claim success from partial output while a child process is still alive.
4. Before handoff, verify no process or port started by the task remains active.
5. Record timeouts and environmental blockers separately from test failures; neither may be presented as a passing gate.
