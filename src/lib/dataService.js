let state = {
  currentUser: {},
  users: [],
  reactions: { message: {}, track: {} },
  playlist: [],
  messages: [],
}

function dataService(callback, receive) {
  callback({ type: "SET_DATA", data: state })

  receive(event => {
    if (event.type === "SET_DATA") {
      state = { ...state, ...event.data }
      console.log("newState", state)
    }
  })
}

export default dataService
