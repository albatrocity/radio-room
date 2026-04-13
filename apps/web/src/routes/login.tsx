import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  Box,
  Button,
  Center,
  Heading,
  HStack,
  Icon,
  Input,
  Text,
  VStack,
  Separator,
} from "@chakra-ui/react"

import Layout from "../components/layout"
import { authClient } from "@repo/auth/client"
import { LuChrome } from "react-icons/lu"

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
      navigate({ to: "/admin", replace: true })
    }
  }

  async function handleGoogleLogin() {
    await authClient.signIn.social({
      provider: "google",
      // Absolute URL: Better Auth baseURL is the API; relative paths would redirect to api.* .
      callbackURL: `${window.location.origin}/admin`,
    })
  }

  return (
    <Layout>
      <Center minH="80vh">
        <Box w="full" maxW="sm">
          <VStack gap={6}>
            <Heading size="xl">Admin Login</Heading>

            <Button onClick={handleGoogleLogin} variant="outline" w="full" size="lg">
              <HStack gap={2}>
                <Icon as={LuChrome} boxSize={5} />
                <Text>Sign in with Google</Text>
              </HStack>
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
                  Sign in with Email
                </Button>
              </VStack>
            </form>
          </VStack>
        </Box>
      </Center>
    </Layout>
  )
}
