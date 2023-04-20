# Radio Room

Front-end for [https://listen.show](https://listen.show). A [Gatsby](http://gatsbyjs.com)/[Chakra](https://chakra-ui.com)/[XState](http://xstate.js.org)/Zustand(https://github.com/pmndrs/zustand) app that communicates to a chat server and plays music streaming from a Shoutcast server.

## Dev

- Install dependencies with `yarn`
- create a `.env` file and add values for `GATSBY_STREAM_URL=<YOUR SHOUTCAST SERVER HERE>` and `GATSBY_API_URL=<YOUR CHAT SERVER HERE>`
- `yarn develop`

Check the [radio-room-server](https://github.com/albatrocity/radio-room-server) repo for the server-side component.
