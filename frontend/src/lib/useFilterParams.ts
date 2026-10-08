import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * List filters kept in the URL so they survive reloads and can be linked to (e.g. from the dashboard).
 * `update` sets or clears keys (an empty string clears) and returns to page 1 unless `page` is in the patch.
 * The search box is debounced into the `search` param.
 */
export function useFilterParams() {
  const [params, setParams] = useSearchParams();
  const urlSearch = params.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);

  const update = useCallback(
    (patch: Record<string, string>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      if (search.trim() !== urlSearch) update({ search: search.trim() });
    }, 350);
    return () => clearTimeout(id);
  }, [search, urlSearch, update]);

  const clear = useCallback(() => {
    setSearch('');
    setParams({}, { replace: true });
  }, [setParams]);

  return {
    params,
    search,
    setSearch,
    urlSearch,
    page: Math.max(1, Number(params.get('page')) || 1),
    update,
    clear,
  };
}
