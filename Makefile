# Listening Room — convenience targets (see AGENTS.md for full workflows).
.PHONY: game-studio

# Game Studio Vite app — matches apps/game-studio/vite.config.ts server.port
GAME_STUDIO_APP_URL := http://localhost:8005
# Room UI preview (matches apps/game-studio/src/studio/constants.ts STUDIO_ROOM_ID)
GAME_STUDIO_ROOM_URL := http://localhost:8000/rooms/studio-room

## Run studio-bridge + Game Studio + web (studio-bridge API mode), then open Game Studio + preview room. No Docker required.
game-studio:
	npx concurrently -n bridge,studio,web,browse -c blue,green,magenta,gray \
		"npm run dev -w studio-bridge" \
		"npm run dev -w game-studio" \
		"npm run dev:studio-bridge -w web" \
		"sh -c 'sleep 5 && if command -v open >/dev/null 2>&1; then open \"$(GAME_STUDIO_APP_URL)\" && open \"$(GAME_STUDIO_ROOM_URL)\"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open \"$(GAME_STUDIO_APP_URL)\"; xdg-open \"$(GAME_STUDIO_ROOM_URL)\"; else printf \"%s\\n\" \"Open $(GAME_STUDIO_APP_URL) and $(GAME_STUDIO_ROOM_URL) in your browser.\"; fi'"
