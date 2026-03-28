import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  Box,
  Button,
  Center,
  Heading,
  Input,
  Text,
  VStack,
  Separator,
} from "@chakra-ui/react"
import { authClient } from "@repo/auth/client"

export const Route = createFileRoute("/login")({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await authClient.signIn.email({
      email,
      password,
    })

    setLoading(false)
    if (error) {
      setError(error.message ?? "Invalid email or password")
    } else {
      navigate({ to: "/", replace: true })
    }
  }

  async function handleGoogleLogin() {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.origin + "/",
    })
  }

  return (
    <Center minH="100vh">
      <Box w="full" maxW="sm" px={4}>
        <VStack gap={6}>
          <VStack gap={1}>
            <Heading size="2xl">Scheduler</Heading>
            <Text color="fg.muted">Sign in to access show scheduling</Text>
          </VStack>

          <Button onClick={handleGoogleLogin} variant="outline" w="full" size="lg">
            Sign in with Google
          </Button>

          <Separator />

          <form onSubmit={handleEmailLogin} style={{ width: "100%" }}>
            <VStack gap={4} w="full">
              <Input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                size="lg"
              />
              <Input
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                size="lg"
              />
              {error && (
                <Text color="red.500" fontSize="sm">
                  {error}
                </Text>
              )}
              <Button type="submit" w="full" size="lg" loading={loading}>
                Sign in
              </Button>
            </VStack>
          </form>
        </VStack>
      </Box>
    </Center>
  )
}
