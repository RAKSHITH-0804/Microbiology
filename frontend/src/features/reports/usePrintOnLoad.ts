import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Opens the print dialog once when the page was linked with `?print=1` (e.g. "View & Print" in the archive)
 * and the saved report has loaded. The param is removed so a reload or Back does not print again.
 */
export function usePrintOnLoad(loaded: boolean, hasReport: boolean) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('print') === '1';
  const handled = useRef(false);

  useEffect(() => {
    if (!requested || !loaded || handled.current) return;
    const clearParam = () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('print');
          return next;
        },
        { replace: true },
      );
    if (!hasReport) {
      handled.current = true;
      clearParam();
      return;
    }
    // Give the form one render to fill the print layout with the loaded report.
    const id = setTimeout(() => {
      handled.current = true;
      clearParam();
      window.print();
    }, 300);
    return () => clearTimeout(id);
  }, [requested, loaded, hasReport, setParams]);
}
