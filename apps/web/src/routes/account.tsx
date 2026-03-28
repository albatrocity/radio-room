import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Box, Center, Container, Heading, Spinner } from "@chakra-ui/react"
import { authClient } from "@repo/auth/client"
import PageLayout from "../components/PageLayout"
import ChangePassword from "../components/Lobby/ChangePassword"

export const Route = createFileRoute("/account")({
  component: AccountPage,
})

function AccountPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login", replace: true })
    }
  }, [isPending, session, navigate])

  if (isPending) {
    return (
      <PageLayout>
        <Center h="50vh">
          <Spinner size="xl" />
        </Center>
      </PageLayout>
    )
  }

  if (!session) {
    return null
  }

  return (
    <PageLayout>
      <Container margin={0}>
        <Heading as="h1" size="2xl" mb={6}>
          Account
        </Heading>
        <Box mb={8}>
          <ChangePassword />
        </Box>
      </Container>
    </PageLayout>
  )
}
