import {
  SESSION_ADMIN,
  SESSION_ID,
  SESSION_PASSWORD,
  SESSION_USERNAME,
} from "../constants"

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function read(key: string): string | null {
  if (!isBrowser()) return null
  const fromLocal = localStorage.getItem(key)
  if (fromLocal !== null) return fromLocal
  return sessionStorage.getItem(key)
}

function write(key: string, value: string): void {
  if (!isBrowser()) return
  localStorage.setItem(key, value)
  sessionStorage.removeItem(key)
}

function remove(key: string): void {
  if (!isBrowser()) return
  localStorage.removeItem(key)
  sessionStorage.removeItem(key)
}

export function getStoredUserId(): string | null {
  return read(SESSION_ID)
}

export function setStoredUserId(id: string): void {
  write(SESSION_ID, id)
}

export function getStoredUsername(): string | null {
  return read(SESSION_USERNAME)
}

export function setStoredUsername(name: string): void {
  write(SESSION_USERNAME, name)
}

export function getStoredPassword(): string | null {
  return read(SESSION_PASSWORD)
}

export function setStoredPassword(pwd: string): void {
  write(SESSION_PASSWORD, pwd)
}

export function getStoredIsAdmin(): boolean {
  return read(SESSION_ADMIN) === "true"
}

export function setStoredIsAdmin(flag: boolean): void {
  write(SESSION_ADMIN, flag ? "true" : "false")
}

export function clearStoredUser(): void {
  remove(SESSION_ID)
  remove(SESSION_USERNAME)
}
