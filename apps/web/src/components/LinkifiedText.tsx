import { Link, Text, type TextProps } from "@chakra-ui/react"
import { splitTextWithHttpUrls } from "@repo/utils"

type LinkifiedTextProps = Omit<TextProps, "children"> & { children: string }

/** Plain text with http(s) URLs turned into links. Preserves newlines unless `lineClamp` is set. */
export function LinkifiedText({ children, lineClamp, ...props }: LinkifiedTextProps) {
  const parts = splitTextWithHttpUrls(children)
  return (
    <Text {...props} lineClamp={lineClamp} whiteSpace={lineClamp != null ? "normal" : "pre-wrap"}>
      {parts.map((part, i) =>
        part.type === "url" ? (
          <Link
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            textDecoration="underline"
          >
            {part.value}
          </Link>
        ) : (
          part.value
        ),
      )}
    </Text>
  )
}
