import { cn } from '../../ui/cn';
import { GitHubMark } from './parts';

const BOX = { sm: 'size-8 rounded-[8px]', md: 'size-10 rounded-[10px]', lg: 'size-14 rounded-[14px]' };

/** Bitbucket's blue bucket on its own tile. */
export function BitbucketMark({ size = 'md', className }) {
  return (
    <span className={cn('grid shrink-0 place-items-center bg-[#0052cc] text-white', BOX[size] ?? BOX.md, className)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[56%]" fill="currentColor">
        <path d="M3.3 3a.7.7 0 0 0-.7.8l2.8 16.9a1 1 0 0 0 1 .8h11.4a.7.7 0 0 0 .7-.6l2.9-17.1a.7.7 0 0 0-.7-.8H3.3zm10.6 12H10.1L9.1 9.6h5.8l-1 5.4z" />
      </svg>
      <span className="sr-only">Bitbucket</span>
    </span>
  );
}

/** Jenkins: a "J" on the brand red. */
export function JenkinsMark({ size = 'md', className }) {
  return (
    <span className={cn('grid shrink-0 place-items-center bg-[#d33833] text-white', BOX[size] ?? BOX.md, className)}>
      <span aria-hidden="true" className={cn('font-display leading-none font-extrabold', size === 'lg' ? 'text-[24px]' : 'text-[15px]')}>
        J
      </span>
      <span className="sr-only">Jenkins</span>
    </span>
  );
}

export const SOURCE_MARKS = { github: GitHubMark, bitbucket: BitbucketMark, jenkins: JenkinsMark };

/** A guide's table (permissions, options, token levels), scrolling sideways on a narrow screen. */
export function GuideTable({ table, className }) {
  return (
    <div className={cn('mt-2 overflow-x-auto rounded-[var(--radius-control)] border border-line', className)}>
      <table className="w-full min-w-[30rem] text-left text-[12.5px]">
        <thead className="bg-surface-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {table.rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td key={index} className={cn('px-3 py-2 align-top', index === 0 ? 'font-medium text-ink' : 'text-ink-2')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
