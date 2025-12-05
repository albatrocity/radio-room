# Goals and current framing

1. I want an application state that can be completely serialized and persisted in session storage for quick rehydration.
2. For now I want to continue using state machines with XState v4, with an eye towards upgrading to XState v5 in the future.
3. Machines like auth should be a singleton that all components and state machines can access the context of and send messages to.
4. Machines like roomMachine should be a singleton initialized on the room route
5. The usage of Zustand should be evaluated. Can we accomplish singleton and global state with XState only?
6. When considering ways to globalize state, keep in mind that we may move away from React in the future, so we should avoid relying too heavily on React-specific patterns to share or manipulate context.
7. I am open to completely redesigning the application architecture and state to accomplish these goals.
8. Routing does _not_ need to be a part of this new global application state, since it is managed by Tanstack Router
9. We need to maintain the behavior of our PluginComponent machines, since our plugin system is reliant on them

My initial thinking is that of Redux or a single store for all state, but I'm not sure if this will be appropriate, especially if we break things into multiple machines. It makes more sense to me to use machines to manage a global state according to their purpose and internal logic, but I'm not sure if this is the best approach.

The previous migration attempt (read /plans/xstate-v5-migration-learnings.md) was too broad and raised a lot of architectural questions mid-flight, and ended up in one massive machine that seemed to mix concerns and was very hard to understand. I think a singular application state managed by multiple machines according to their own logic might be what I'm looking for: essentially using state machines as one would Redux reducers. Is this anti-pattern?

The current implementation has a lot of global state that is shared between components and machines. This is not ideal and makes it difficult to test and reason about the application state. The thing I _like_ about the current implementation is that Socket Events are essentially global, and each machine can subscribe to the events that are relevant to it. This pattern makes sense to me and feels like a modular way to manage smaller pieces of state. For instance, the ChatMachine subscribes to `MESSAGE_RECEIVED` events and adds the new message to its local state. This could certainly be done at the _room_ state level, but it's a nice separation of converns that makes state feel less overwhelming. I realize there are tradeoffs to this approach, and I'm open to completely redesigning the application architecture and state to accomplish these goals.

# Acknowledgements

- the current implementation is legacy, and was architected while learning XState. I'm certain best practices were not always followed, and we should feel free to abandon any patterns previously established without trying to make things "backwards compatible"
- I will accept a reframing of state management better suited to this application (a realtime chat and music app where rooms have their own unique configuration)
- I don't really know how socket connections, listeners, and emitters should be managed. Should it be its own machine? Should it be a callback that machines invoked? Should it live outside of the machine architecture? Our system events were designed with state machine listeners in mind.

## Socket machine/service

- handles socket connection and disconnection
- handles socket events
- handles socket errors
- handles socket reconnects
- handles socket reconnect failures
- handles socket reconnect success
- handles socket reconnect failure
- handles socket reconnect success

## Auth machine

- always present
- retrieves and persists user session from session storage
- utilizes "guest" login for anonymous users
- utilizes OAuth login (provided by MetadataSources) for room admins

## Room machine

- only present on the room route
- handles room data retrieval and persistence
- handles the state of various room features like playlist, admin, chat, room settings, listeners, etc. - this can be done with a single machine or a collection of machines as long as serialization and orchestration is straightforward and easy to understand.
- depends on the socket and auth machines

## Other machines

Other machines that are more UI-focused, multi-instance machines (like modals, admin, timer, toggleableCollection, etc.) should be created as needed and disposed of when no longer needed. Their puspose is to extract behavior out of React components to make it more portable and easier to test.

# Other resources

I do not necessarily endorse these, but they relate to this scope of work.

- https://stately.ai/blog/2021-05-27-global-state-xstate-react
- https://stately.ai/blog/2023-1-27-making-state-machines-global-in-react
- https://www.frontendundefined.com/posts/monthly/xstate-in-react/
