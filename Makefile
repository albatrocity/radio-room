# Listening Room — convenience targets (see AGENTS.md for full workflows).
.PHONY: game-studio

## Run Game Studio Vite dev server (http://localhost:8002). No Docker Compose stack required.
game-studio:
	npm run dev -w game-studio
