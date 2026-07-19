# Runtime Environment & Topology

> This is an accessible, in-project copy of the platform `environment.md`, extended
> with knowledge distilled from installing a server-bearing open-source app (AI-Q)
> as the project's dev server. New material lives in the **Preview origin & routing**,
> **`NODE_ENV`**, and **`startDev` hook contract** sections below.

## Topology

Each project runs as **two cooperating servers**, launched on demand by the platform **orchestrator**. Both mount the **same** `/usr/project` volume — the same files, live, on both.

- **Edit server** — the editing / agent control plane. This is where project files in `/usr/project` are edited (your file-editing tools operate against this mount).
- **Dev server** — the execution environment. It shares the same `/usr/project` mount and is where:
  - your **shell commands run** (the shell tool executes here, not on the edit server),
  - the **site view** runs — the project's own frontend dev process (`npm run dev`), which the user previews, and
  - **custom backends run** — any REST/WS API, Python server, or installed open-source backend you start runs here, **alongside the frontend**.

The two servers are separate machines from a networking standpoint: a process listening on `localhost` of one is **not** reachable from the other. Only `/usr/project` is shared.

## Custom backends run on the dev server

A custom backend is just an ordinary long-running process you start on the **dev server** (via the shell), co-located with the frontend site view.

- Start it from the project (e.g. a `workbench/<name>` directory, see below) with a **self-installing, idempotent** command (`uv sync && uv run …`, `npm ci && node …`): the dev server's filesystem **outside `/usr/project` is wiped on restart**, so the install step must be able to re-run cleanly.
- It must **bind `0.0.0.0`** (see Networking) so it is reachable from the browser/preview proxy — not just from the same machine.
- Because the frontend and backend are on the **same** machine now, the frontend may reach the backend over `localhost` on the dev server (or, preferably, through the vite dev-server proxy so the browser uses same-origin relative URLs).
- Source-file changes do **not** hot-reload a backend by themselves: run it in its own watch mode (use **polling** watchers — inotify is unreliable here) or restart the process after changes.
- The dev server has `node`, `npm`, `python3`, and `uv` available. No root — same as everywhere (see Installing software).

## Ports — discover before binding; never kill the occupant

The dev server already runs platform services **and** the project's own dev/vite process. Those ports are occupied **for a reason**. Before you start or install anything that binds a port:

1. **Discover what is already listening** — do not assume a port is free:
   - `lsof -iTCP -sTCP:LISTEN -P -n`  (or `ss -ltnp`)
2. **Pick a free port** for your new process. Binding an occupied one fails with `EADDRINUSE`, or a proxy silently reaches the wrong service.
3. **Never kill a process just to free its port.** If the port you want is taken, first identify the occupant:
   - **A platform service, the vite/dev process, or any unrelated process** → leave it running and choose a different port. Do not kill it.
   - **Your OWN previous instance of the same daemon** (a stale copy left by an earlier start) → confirm it really is the same command/binary, then **stop it properly** — send `SIGTERM` (or use the tool's own stop/shutdown command) and let it exit gracefully. Only fall back to a harder signal if it refuses to exit, and never `kill -9` blindly.
   - **Unsure what it is** → treat it as not-yours: pick another port rather than risk killing something load-bearing.

Known platform-occupied ports (typical — still verify at runtime, do not hardcode assumptions): the edit server uses `3000` / `3100` / `4000`; the dev server uses `3001` (platform) and `5173` (the app's vite).

## Preview origin & routing

- The browser preview is served **only from port `5173`** on the dev server. The editor's preview origin is locked to `{projectId}-5173` — serving your app there is what makes it first-class and visually editable. Do not try to surface a different port as the preview.
- The public routed host follows the pattern `**.dazl-preview.ninja` (e.g. `…-5173.development.dazl-preview.ninja`).
- Any cross-origin allowlist a framework enforces (e.g. Next.js `allowedDevOrigins`) **must** include the preview origin and `**.dazl-preview.ninja`, or assets/HMR are blocked and the preview loads with missing scripts (blank page, no JS).

## The `dev` script contract — never wrap it

The platform does not run `npm run dev` bare. It runs the package.json `dev` script with **extra arguments appended**: `<projectRoot> -c <platform-vite-config> --strictPort`. The script must therefore stay a **single vite/react-router-style command** (e.g. `react-router dev`) that accepts those trailing arguments.

- **Never wrap `dev` in `concurrently`, `npm-run-all`, `&&` chains, or a shell script.** The appended `<projectRoot>` becomes an extra "command" to the wrapper — it fails instantly with `Permission denied` (executing a directory), and `--kill-others` flags then take the real dev server down with it.
- Need a second process? It does not belong in `dev`: long-running backends are started separately on the dev server (see above); a genuinely custom dev-server launch goes in a `dazl.hooks.ts` `startDev` hook (must return `{ port }`).

### `NODE_ENV` gotcha

- The platform shell exports `NODE_ENV=production`. Any custom dev launcher (a `startDev` hook, a backend, a framework server) must **explicitly override `NODE_ENV=development`** or it will build in production mode with no HMR.

### `startDev` hook contract

When a custom dev-server launch is needed, a `dazl.hooks.ts` `startDev` hook owns it. The hook:

- runs on the **dev server**, with `cwd` set to the project root;
- must **resolve within ~15s** — poll for the port being open (accepting connections), **not** for first compile to finish, which can take much longer;
- has an **IPC-serialized** return value, so it can only return plain data like `{ port }` — it **cannot** return a `stop()` function. Do cleanup in a `SIGTERM` handler instead;
- should `spawn` children **`detached`** so the whole process tree can be killed via the process group on shutdown.

## Project volume: `/usr/project`

- `/usr/project` is the project root. It is a shared volume mounted in **both** servers — file changes you make on the edit server are immediately visible to the running app and backends on the dev server.
- It is the **only persistent location**: it is saved on shutdown and restored on boot. Anything written or installed outside `/usr/project` is lost when the environment restarts.
- Therefore, declare every dependency in `package.json` (via the dependency-install tool) so it can be restored after a reboot. Never depend on ad-hoc global installs surviving a restart.

## `workbench/` — where third-party code lives

**`/usr/project/workbench/` is the designated home for anything that is not the web app itself**: cloned open-source repos, installed backends, experiments. Its *sources* are visible in the editor, but its heavy internals (`.venv`, nested `.git`, `node_modules`) are excluded from the editor's file tree, component discovery, and change detection by default (via `ignoredSubPaths` in `dazl.config.json`) — huge dependency trees there would otherwise degrade or crash the editor. It lives on the shared volume, so it **persists across restarts** and is visible to both servers.

- Install/clone into `workbench/<name>` (`mkdir -p` it if missing). Clone **shallow** (`git clone --depth 1`) and delete leftover duplicate copies.
- If a workbench tree contains other huge generated directories (caches, model weights, datasets), add them to `ignoredSubPaths` too — tens of thousands of indexed files will crash the editor.
- **Never persist virtualenvs or dependency caches anywhere in the project** (including workbench): they still bloat the shutdown snapshot with tens of thousands of files. Point environments outside the project, e.g. `UV_PROJECT_ENVIRONMENT=$HOME/.venvs/<name>`, and make backend start commands self-installing (see above) so they are rebuilt automatically after a restart.
- To exclude additional paths from editor scanning, extend `ignoredSubPaths` in `dazl.config.json` — note that setting it **replaces** the defaults, so keep the existing entries.

## Exclude every build / work / temp directory — or the editor dies

The editor's file scanner (on the edit server) indexes the whole project for the file tree, component discovery, and change detection. A generated directory holds tens of thousands of files; when the scanner walks one, the node process **runs out of memory and crashes**, taking the editor down. This is not a slow-down — it is a hard failure.

**Rule: any directory that is generated, downloaded, or scratch — not hand-written source — MUST be listed in `ignoredSubPaths` in `dazl.config.json` before it can grow.** Add the entry as soon as you create a process that will write there (a build step, an install, a clone), not after the crash.

Covers, non-exhaustively:

- **Build / output**: `dist`, `build`, `out`, `.next`, `.turbo`, `.vite`, `.cache`, `coverage`, `storybook-static`.
- **Dependencies / envs**: `node_modules` (including nested ones under `workbench/`), Python `.venv`/virtualenvs, `__pycache__`, `.mypy_cache`, `.pytest_cache`.
- **Work / temp / data**: temp and scratch dirs, downloaded datasets, model weights, logs, anything a backend generates at runtime.

Notes:
- Setting `ignoredSubPaths` **replaces** the built-in defaults — always restate the existing entries when you add yours, or you will silently un-ignore what was protected.
- Excluding a path from the scanner is **not** the same as keeping it out of the persistent snapshot. Heavy dependency/build caches still bloat the shutdown snapshot even when ignored — keep those **outside `/usr/project`** entirely (e.g. `UV_PROJECT_ENVIRONMENT=$HOME/.venvs/<name>`) and rely on self-installing start commands to rebuild them (see below and `workbench/`).

## Installing software

- There is **no root access and no `sudo`**. Never use `sudo`, `su`, `apt`, `apk`, `yum`, `dnf`, or any system package manager — they will fail.
- Everything must be installed and run in **user space**: project-local npm packages inside `/usr/project` (preferred), or user-writable locations such as `$HOME`.
- If a tool requires root to install or run, do not attempt workarounds — pick a user-space alternative instead.

## Networking

- Every server process you add is accessed from other machines (the browser, the preview proxy). It must therefore **bind to `0.0.0.0` (all interfaces / the machine IP) — never `localhost` or `127.0.0.1`**. A localhost-bound server starts fine but is unreachable from outside, which looks like a mysteriously dead endpoint.
  - Node example: `app.listen(port, "0.0.0.0")`.
  - Vite/dev servers: pass `--host` or set `server.host: true`.
  - Python example: `uvicorn main:app --host 0.0.0.0 --port <port>`.
- The frontend and backend now run on the **same** machine (the dev server), so the frontend may call the backend over `localhost` there — but prefer routing browser-facing calls through the vite dev-server **proxy** so the browser uses same-origin relative URLs rather than a hardcoded host/port.
- Do not assume outbound `localhost` connectivity **between** the two servers — only `/usr/project` is shared; the edit server and dev server are different machines.
