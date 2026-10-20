# Listening Room — convenience targets (see AGENTS.md for full workflows).
.PHONY: game-studio

# Game Studio Vite app — matches apps/game-studio/vite.config.ts server.port
GAME_STUDIO_APP_URL := http://localhost:8005
# Room UI preview (matches apps/game-studio/src/studio/constants.ts STUDIO_ROOM_ID)
GAME_STUDIO_ROOM_URL := http://localhost:8000/rooms/studio-room

# Run a command with an app's env file exported, when the file exists.
# $(1) = env file (repo-relative), $(2) = command.
with_env = sh -c 'set -a; if [ -f $(1) ]; then . ./$(1); fi; set +a; exec $(2)'

## Run studio-bridge + Game Studio + web (studio-bridge API mode), then open Game Studio + preview room. No Docker required.
## Each process gets its own app's env: apps/studio-bridge/.env, apps/game-studio/.env, and
## apps/web/.env.studio-bridge (not apps/web/.env, whose VITE_API_URL would point the preview
## at the real API: Vite lets process env win over mode files).
game-studio:
	npx concurrently -n bridge,studio,web,browse -c blue,green,magenta,gray \
		"$(call with_env,apps/studio-bridge/.env,npm run dev -w studio-bridge)" \
		"$(call with_env,apps/game-studio/.env,npm run dev -w game-studio)" \
		"$(call with_env,apps/web/.env.studio-bridge,npm run dev:studio-bridge -w web)" \
		"sh -c 'sleep 5 && if command -v open >/dev/null 2>&1; then open \"$(GAME_STUDIO_APP_URL)\" && open \"$(GAME_STUDIO_ROOM_URL)\"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open \"$(GAME_STUDIO_APP_URL)\"; xdg-open \"$(GAME_STUDIO_ROOM_URL)\"; else printf \"%s\\n\" \"Open $(GAME_STUDIO_APP_URL) and $(GAME_STUDIO_ROOM_URL) in your browser.\"; fi'"
