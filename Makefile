# Listening Room — convenience targets (see AGENTS.md for full workflows).
.PHONY: game-studio

## Run studio-bridge + Game Studio (bridge http://127.0.0.1:3099, UI http://localhost:8005). No Docker required.
game-studio:
	npx concurrently -n bridge,studio -c blue,green \
		"npm run dev -w studio-bridge" \
		"npm run dev -w game-studio"
