import { categoryColor, categoryName } from '@/lib/data';
import type { CategoryId } from '@/lib/data';

interface CategoryPillProps {
  catId: CategoryId | string;
}

export function CategoryPill({ catId }: CategoryPillProps) {
  return (
    <span className="cat-pill">
      <span className="swatch" style={{ background: categoryColor(catId) }} />
      {categoryName(catId)}
    </span>
  );
}
