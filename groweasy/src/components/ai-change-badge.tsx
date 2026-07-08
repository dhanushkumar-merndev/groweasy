import { Badge } from "@/components/ui/badge"

export function AiChangeBadge({ count }: { count: number }) {
  if (count === 0) {
    return <Badge variant="outline">No AI changes</Badge>
  }

  return <Badge>{count} changed</Badge>
}
