import { User } from "@repo/types"
import { Factory } from "fishery"

export const userFactory = Factory.define<User>(({ sequence }) => ({
  id: `user-${sequence}`,
  username: `user${sequence}`,
  displayName: `User ${sequence}`,
  email: `user-${sequence}@email.com`,
  userId: `user-id-${sequence}`,
  isAdmin: false,
  isDeputyDj: false,
  isDj: false,
  status: "participating",
}))

export const listenerFactory = userFactory.params({
  status: "listening",
})

export const djFactory = userFactory.params({
  status: "listening",
  isDj: true,
})

export const deputyDjFactory = userFactory.params({
  status: "listening",
  isDj: false,
  isDeputyDj: true,
})

export const adminFactory = userFactory.params({
  isAdmin: true,
})
