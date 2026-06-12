import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Location } from '@/lib/model';

interface LocationTabsProps {
  locations: Location[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onManage: () => void;
  canManage: boolean;
}

export default function LocationTabs({
  locations,
  currentId,
  onSelect,
  onManage,
  canManage,
}: LocationTabsProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {locations.map((loc) => (
        <button
          key={loc.id}
          type="button"
          onClick={() => onSelect(loc.id)}
          className={cn(
            'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
            loc.id === currentId
              ? 'bg-primary text-primary-foreground shadow'
              : 'bg-secondary text-secondary-foreground hover:bg-accent'
          )}
        >
          {loc.name}
        </button>
      ))}
      {canManage ? (
        <Button variant="ghost" size="iconSm" onClick={onManage} title="拠点の管理">
          <Settings2 />
        </Button>
      ) : null}
    </div>
  );
}
