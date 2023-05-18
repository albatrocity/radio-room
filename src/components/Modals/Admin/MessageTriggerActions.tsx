import React from "react"
import { useMachine } from "@xstate/react"
import merge from "ts-deepmerge"

import { triggerEventsMachine } from "../../../machines/triggerEventsMachine"
import { defaultMessageTriggerEvents } from "../../../lib/defaultTriggerActions"
import { TriggerEvent } from "../../../types/Triggers"
import TriggerActions from "./TriggerActions"
import { ChatMessage } from "../../../types/ChatMessage"

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
  triggers: TriggerEvent<ChatMessage>[]
}

const MessageTriggerActions = () => {
  const defaultTriggerEvents = defaultMessageTriggerEvents
  const [state, send] = useMachine(triggerEventsMachine)
  const triggers = state.context.messages

  const initialValues: FormState = {
    triggers: triggers.map((t) =>
      merge(defaultAction, t),
    ) as TriggerEvent<ChatMessage>[],
  }

  return (
    <TriggerActions<ChatMessage>
      type="message"
      initialValues={initialValues}
      defaultTriggerEvents={defaultTriggerEvents}
      onSubmit={(values) => {
        send(`SET_MESSAGE_TRIGGER_EVENTS`, {
          data: values.triggers,
        })
      }}
    />
  )
}

export default MessageTriggerActions
