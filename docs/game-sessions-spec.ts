// plugins should be able to define their own game state attributes and effects
type GameStateAttributeName = "score" | "coin" | "health"

type GameStateEffect = {
  target: GameStateAttributeName
  outcome:
    | {
        type: "multiplier"
        value: 2
      }
    | { type: "toggle"; value: boolean }
}

type GameStateModifier = {
  name: string // e.g. "poisoned", "buffed"
  startAt: number // timestamp in milliseconds
  endAt: number // timestamp in milliseconds, would "duraion" be better?
  effects: Array<GameStateEffect>
}

type GameStateAttribute = {
  name: GameStateAttributeName
  value: number
}

type UserGameState = {
  score: number
  coin: number
  attributes: Array<GameStateAttribute>
  modifiers: Array<GameStateModifier>
}
