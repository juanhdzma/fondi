import type { ReactNode } from 'react';
import { latest } from '../computed.js';
import { daysSince, freshness, greeting } from '../utils/dates.js';

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  const last = latest();
  const age = last ? daysSince(last.fecha) : null;
  return (
    <div className="page-heading page-heading-actions">
      <div>
        <div className="page-greeting">{greeting()}</div>
        <h1>{title}</h1>
        {last && <div className={`page-freshness${age !== null && age > 7 ? ' stale' : ''}`}>{freshness(last.fecha)}</div>}
      </div>
      {children}
    </div>
  );
}
