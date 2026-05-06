# Game Studio

Game Studio is a **browser-only** sandbox for testing in-game items, shopping sessions, coins, modifiers, and related plugin behavior. It does **not** need Docker, Redis, or the main API—only Node.js and this repository.

## What you will edit

All current items, shop definitions, and use/sell behaviors for the studio live in **`packages/plugin-item-shops/`** (for example `items/`, `shops/`, and `behaviors`). Game Studio imports that package directly. Change code there, save, and the dev server will hot-reload your work.

---

## First-time setup (new to this repo)

You only need the monorepo root—do not run `npm install` only inside `apps/game-studio`; workspaces link `@repo/*` packages from the root.

### 1. Install Node.js (LTS)

Use a current **LTS** Node.js (the repo pins compatible versions via npm workspaces). We recommend installing Node through a version manager:

| Platform | Tool | Install |
|----------|------|---------|
| macOS / Linux | **[nvm](https://github.com/nvm-sh/nvm)** | Follow the [nvm install instructions](https://github.com/nvm-sh/nvm#installing-and-updating), then run the commands below in Terminal. |
| Windows | **[nvm-windows](https://github.com/coreybutler/nvm-windows)** | Install from the [releases page](https://github.com/coreybutler/nvm-windows/releases), then open **PowerShell** or **cmd** (elevated if the installer requires it). |

**macOS / Linux (nvm)** — install and select LTS:

```bash
nvm install --lts
nvm use --lts
```

**Windows (nvm-windows)** — pick an **LTS** version from the list (often an even major such as `22.x.x`):

```text
nvm list available
nvm install <version>
nvm use <version>
```

Use the same `<version>` string for both `install` and `use`.

Check in a terminal:

```bash
node -v
npm -v
```

You should see a recent LTS (e.g. v20 or v22).

### 2. Get the repository

**Recommended:** Install **[GitHub Desktop](https://desktop.github.com/)**, sign in to GitHub, and use **File → Clone repository** to clone this repo (fork or upstream) into a folder on your machine. Open that folder in your editor and continue with step 3.

**Optional:** To clone from the command line on **Windows**, install **[Git for Windows](https://git-scm.com/download/win)** and use Git Bash or PowerShell:

```bash
git clone <your-fork-or-upstream-url> radio-room
cd radio-room
```

macOS users who already have Git (e.g. via Xcode Command Line Tools) can run the same commands in Terminal. Use whatever folder name you chose when cloning.

### 3. Install dependencies (required: repository root)

From the **root** of the repository (the folder that contains `package.json` and `apps/`):

```bash
npm install
```

This installs all workspaces, including `apps/game-studio` and `packages/plugin-item-shops`.

---

## Run Game Studio

From the **repository root**:

```bash
make game-studio
```

Then open **http://localhost:8002** in your browser.

**Windows without `make`:** `make` is not installed by default. Use the same script npm uses under the hood:

```bash
npm run dev -w game-studio
```

If you want `make` on Windows, you can install it (e.g. [Chocolatey](https://chocolatey.org/): `choco install make`, or [Scoop](https://scoop.sh/): `scoop install make`, or use **WSL** and run the Linux flow there).

---

## Useful commands (from repository root)

| Command | Purpose |
|--------|--------|
| `make game-studio` or `npm run dev -w game-studio` | Dev server (port **8002**) |
| `npm run build -w game-studio` | Production build into `apps/game-studio/dist` |
| `npm run check-types -w game-studio` | Typecheck the app |

---

## Notes

- **State:** Progress is stored in the browser (localStorage) so refresh and most HMR updates do not wipe the sandbox. Use the in-app **Reset** control to clear it.
- **No Docker:** You do not need `docker compose` for Game Studio.
- **Main app:** The full Listening Room stack (web app, API, etc.) is documented in the [root README](../../README.md); you can ignore it until you need it.

For plugin architecture and server-side behavior, see [Plugin Development](../../docs/PLUGIN_DEVELOPMENT.md) and [AGENTS.md](../../AGENTS.md).
