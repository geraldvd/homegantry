import { useEffect, useState } from 'react';
import { getKbCoverage } from '../api/client';
import { useIconSource } from '../context/IconSourceContext';
import type { KbCoverage } from '../types';

const MISSING_SERVICE_URL =
  'https://github.com/geraldvd/homegantry/issues/new?template=missing_service.yml';

/** Editors only: how much of this lab the knowledge base recognises. */
export default function KbCoverageSection({ open }: { open: boolean }) {
  const { mode } = useIconSource();
  const [coverage, setCoverage] = useState<KbCoverage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setFailed(false);
    getKbCoverage()
      .then((result) => {
        if (active) setCoverage(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [open]);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">
        Knowledge base
      </h3>
      {failed && <p className="text-sm text-red-400">Could not load the coverage report.</p>}
      {!failed && coverage && (
        <div className="space-y-2">
          <p className="text-sm text-gray-200">
            {coverage.recognised} of {coverage.total} containers recognised
          </p>
          {coverage.unrecognised.length > 0 && (
            <>
              <ul
                aria-label="Unrecognised images"
                className="max-h-40 overflow-y-auto rounded-lg bg-surface-700/50 p-2 space-y-1"
              >
                {coverage.unrecognised.map((image) => (
                  <li key={image} className="text-xs text-gray-300 font-mono break-all">
                    {image}
                  </li>
                ))}
              </ul>
              {/* With icons off the page carries no external URL at all. */}
              {mode === 'off' ? (
                <p className="text-xs text-gray-500">
                  Missing a service? Open a &quot;Missing service&quot; issue in the HomeGantry
                  repository.
                </p>
              ) : (
                <a
                  href={MISSING_SERVICE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  Report a missing service
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
