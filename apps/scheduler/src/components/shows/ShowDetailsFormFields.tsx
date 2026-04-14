import { Box, Fieldset, Input, Textarea } from "@chakra-ui/react"
import type { ReactFormExtendedApi } from "@tanstack/react-form"
import { TagCombobox } from "../tags/TagCombobox"

export type ShowDetailsFormValues = {
  title: string
  description: string
  startTime: string
  endTime: string
  tagIds: string[]
}

/** Matches `useForm` return type for show create/edit (validator generics left open). */
export type ShowDetailsReactForm = ReactFormExtendedApi<
  ShowDetailsFormValues,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

interface ShowDetailsFormFieldsProps {
  form: ShowDetailsReactForm
}

export function ShowDetailsFormFields({ form }: ShowDetailsFormFieldsProps) {
  return (
    <Fieldset.Root>
      <Fieldset.Content>
        <Box mb={4}>
          <form.Field name="title">
            {(field) => (
              <Box>
                <label>
                  <Box mb={1} fontSize="sm" fontWeight="medium">
                    Title *
                  </Box>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Show title"
                  />
                </label>
              </Box>
            )}
          </form.Field>
        </Box>
        <Box mb={4}>
          <form.Field name="description">
            {(field) => (
              <Box>
                <label>
                  <Box mb={1} fontSize="sm" fontWeight="medium">
                    Description
                  </Box>
                  <Textarea
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="What is this show about?"
                    rows={3}
                  />
                </label>
              </Box>
            )}
          </form.Field>
        </Box>
        <Box mb={4}>
          <form.Field name="startTime">
            {(field) => (
              <Box>
                <label>
                  <Box mb={1} fontSize="sm" fontWeight="medium">
                    Start Time *
                  </Box>
                  <Input
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </label>
              </Box>
            )}
          </form.Field>
        </Box>
        <Box mb={4}>
          <form.Field name="endTime">
            {(field) => (
              <Box>
                <label>
                  <Box mb={1} fontSize="sm" fontWeight="medium">
                    End Time
                  </Box>
                  <Input
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </label>
              </Box>
            )}
          </form.Field>
        </Box>
        <Box mb={4}>
          <form.Field name="tagIds">
            {(field) => (
              <TagCombobox
                tagType="show"
                value={field.state.value}
                onValueChange={field.handleChange}
                insideOverlay
              />
            )}
          </form.Field>
        </Box>
      </Fieldset.Content>
    </Fieldset.Root>
  )
}
