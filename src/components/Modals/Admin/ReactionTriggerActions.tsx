import React from "react"
import { useMachine } from "@xstate/react"
import merge from "ts-deepmerge"

import { triggerEventsMachine } from "../../../machines/triggerEventsMachine"
import { defaultReactionTriggerEvents } from "../../../lib/defaultTriggerActions"
import { TriggerEvent } from "../../../types/Triggers"
import { Reaction } from "../../../types/Reaction"
import TriggerActions from "./TriggerActions"

const defaultAction = {
  subject: {
    id: "latest",
    type: "track",
  },
  target: {
    id: "latest",
    type: "track",
  },
  action: "likeTrack",
  meta: {
    messageTemplate: "",
  },
}

type FormState = {
  triggers: TriggerEvent<Reaction>[]
}

const ReactionTriggerActions = () => {
  const defaultTriggerEvents = defaultReactionTriggerEvents
  const [state, send] = useMachine(triggerEventsMachine)
  const triggers = state.context.reactions

  const initialValues: FormState = {
    triggers: triggers.map((t) =>
      merge(defaultAction, t),
    ) as TriggerEvent<Reaction>[],
  }

  return (
    <TriggerActions<Reaction>
      type="reaction"
      initialValues={initialValues}
      defaultTriggerEvents={defaultTriggerEvents}
      onSubmit={(values) => {
        send(`SET_REACTION_TRIGGER_EVENTS`, {
          data: values.triggers,
        })
      }}
    />
  )
}

export default ReactionTriggerActions
