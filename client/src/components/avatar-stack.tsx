import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AvatarStackProps {
  members?: { nickname?: string; role?: string }[];
  max?: number;
  size?: string;
}

export function AvatarStack({ members = [], max = 4, size = "w-7 h-7" }: AvatarStackProps) {
  const displayed = members.slice(0, max);
  const remaining = members.length - max;

  return (
    <div className="flex -space-x-2" data-testid="avatar-stack">
      {displayed.map((member, i) => (
        <Avatar key={i} className={`${size} border-2 border-card`}>
          <AvatarFallback className="text-[10px] font-bold bg-accent text-accent-foreground">
            {member.nickname?.[0]?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
      ))}
      {remaining > 0 && (
        <Avatar className={`${size} border-2 border-card`}>
          <AvatarFallback className="text-[10px] font-medium bg-muted text-muted-foreground">
            +{remaining}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
