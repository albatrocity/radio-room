import { useState, useEffect } from "react"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import {
  Box,
  Button,
  Center,
  Heading,
  Input,
  Text,
  VStack,
  Separator,
  Spinner,
} from "@chakra-ui/react"

import Layout from "../components/layout"
import { authApiUrl, authClient, setInviteCodeCookieForOAuth } from "@repo/auth/client"
import { FcGoogle } from "react-icons/fc"

async function authFetch(path: string, options?: RequestInit) {
  const res = await fetch(authApiUrl(path), {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  })
  return res.json()
}

export const Route = createFileRoute("/register")({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const searchParams = useSearch({ from: "/register" })
  const inviteCode = (searchParams as any).invite as string | undefined

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(true)
  const [codeValid, setCodeValid] = useState(false)

  useEffect(() => {
    if (!inviteCode) {
      setValidating(false)
      return
    }

    async function validate() {
      try {
        const data = await authFetch("/invite-only/validate", {
          method: "POST",
          body: JSON.stringify({ code: inviteCode }),
        })
        setCodeValid(data?.valid ?? false)
      } catch {
        setCodeValid(false)
      }
      setValidating(false)
    }

    validate()
  }, [inviteCode])

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await authClient.signUp.email({
      email,
      password,
      name,
      inviteCode,
    } as any)

    setLoading(false)
    if (error) {
      setError(error.message ?? "Registration failed")
    } else {
      navigate({ to: "/admin", replace: true })
    }
  }

  async function handleGoogleSignup() {
    if (inviteCode) {
      setInviteCodeCookieForOAuth(inviteCode)
    }
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/admin",
    })
  }

  if (validating) {
    return (
      <Layout>
        <Center minH="80vh">
          <Spinner size="xl" />
        </Center>
      </Layout>
    )
  }

  if (!inviteCode || !codeValid) {
    return (
      <Layout>
        <Center minH="80vh">
          <VStack gap={4}>
            <Heading size="xl">Invitation Required</Heading>
            <Text color="fg.muted">
              {!inviteCode
                ? "You need an invitation to register. Please ask an admin for an invite link."
                : "This invitation link is invalid or has expired."}
            </Text>
          </VStack>
        </Center>
      </Layout>
    )
  }

  return (
    <Layout>
      <Center minH="80vh">
        <Box w="full" maxW="sm">
          <VStack gap={6}>
            <Heading size="xl">Create Account</Heading>
            <Text color="fg.muted">You've been invited to join Listening Room.</Text>

            <Button onClick={handleGoogleSignup} variant="outline" w="full" size="lg">
              <FcGoogle />
              Sign up with Google
            </Button>

            <Separator />

            <form onSubmit={handleEmailSignup} style={{ width: "100%" }}>
              <VStack gap={4} w="full">
                <Input
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  size="lg"
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  size="lg"
                />
                <Input
                  placeholder="Password (min 8 characters)"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  size="lg"
                />
                {error && (
                  <Text color="red.500" fontSize="sm">
                    {error}
                  </Text>
                )}
                <Button type="submit" w="full" size="lg" loading={loading}>
                  Create Account
                </Button>
              </VStack>
            </form>
          </VStack>
        </Box>
      </Center>
    </Layout>
  )
}
