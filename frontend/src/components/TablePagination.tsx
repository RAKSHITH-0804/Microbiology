import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

export function TablePagination({ page, pageSize, total, loading, onPageChange }: TablePaginationProps) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-slate-600">
      <span>
        Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onPageChange(page - 1)} disabled={page <= 1 || loading}>
          <ChevronLeft /> Previous
        </Button>
        <span>
          Page {page} of {totalPages}
        </span>
        <Button size="sm" variant="outline" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || loading}>
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
