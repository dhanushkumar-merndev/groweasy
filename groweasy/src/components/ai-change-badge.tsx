import { Badge } from "@/components/ui/badge"

export function AiChangeBadge({ count }: { count: number }) {
  if (count === 0) {
    return <Badge variant="outline">No AI changes</Badge>
  }

  return <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-500/90">{count} changed</Badge>
}
