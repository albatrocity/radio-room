import React from "react"
import ReactDOM from "react-dom/client"
import { Provider } from "./components/ui/provider"
import { GameStudioApp } from "./GameStudioApp"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider>
      <GameStudioApp />
    </Provider>
  </React.StrictMode>,
)
