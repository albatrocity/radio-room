import { Factory } from "fishery"

export interface PlatformUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: string
  createdAt: Date
  updatedAt: Date
}

export interface PlatformSession {
  id: string
  userId: string
  token: string
  expiresAt: Date
  ipAddress: string
  userAgent: string
  createdAt: Date
  updatedAt: Date
}

export const platformUserFactory = Factory.define<PlatformUser>(({ sequence }) => ({
  id: `platform-user-${sequence}`,
  name: `Admin ${sequence}`,
  email: `admin${sequence}@listeningroom.club`,
  emailVerified: true,
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
}))

export const platformRegularUserFactory = platformUserFactory.params({
  role: "user",
})

export const platformSessionFactory = Factory.define<PlatformSession>(({ sequence }) => ({
  id: `session-${sequence}`,
  userId: `platform-user-${sequence}`,
  token: `token-${sequence}`,
  expiresAt: new Date(Date.now() + 86400000),
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  createdAt: new Date(),
  updatedAt: new Date(),
}))
