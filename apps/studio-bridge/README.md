# Studio bridge

Local **Socket.IO + HTTP** server used to drive the real **web** Room UI (`apps/web`) from **Game Studio** (`apps/game-studio`).

- Listens on **`127.0.0.1:3099`** by default (`STUDIO_BRIDGE_PORT`).
- Game Studio POSTs serialized sandbox state to **`POST /sync`**.
- The web app points `VITE_API_URL` at this server and joins room **`studio-room`** (see `STUDIO_ROOM_ID` in Game Studio).

Started automatically via **`make game-studio`** alongside the Game Studio Vite dev server.
