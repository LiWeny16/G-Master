import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, FileEdit, Undo2, X } from 'lucide-react';
import './DiffBlock.css';

/* ── Types ── */

export interface DiffBlockProps {
  /** File path being edited */
  filePath: string;
  /** Unified diff text */
  diff: string;
  /** Edit ID for accept/reject actions */
  editId: number;
  /** Current status */
  status: 'applied' | 'rejected';
  /** Called when user clicks Reject (rollback) */
  onReject?: (editId: number) => void;
  /** Called when user clicks Accept (re-apply) */
  onAccept?: (editId: number) => void;
  /** Language */
  lang?: 'zh' | 'en';
}

interface ParsedDiffLine {
  type: 'added' | 'removed' | 'context' | 'header';
  content: string;
  oldLine?: number;
  newLine?: number;
}

/* ── Diff parser ── */

function parseDiffLines(diff: string): ParsedDiffLine[] {
  const rawLines = diff.split('\n');
  const result: ParsedDiffLine[] = [];

  let oldLine = 0;
  let newLine = 0;
  let headerSkipped = false;

  for (const raw of rawLines) {
    // Skip --- a/... and +++ b/... file headers
    if (raw.startsWith('--- ') || raw.startsWith('+++ ')) {
      if (!headerSkipped && raw.startsWith('+++ ')) {
        headerSkipped = true;
      }
      continue;
    }

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (raw.startsWith('@@')) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: 'header', content: raw });
      continue;
    }

    if (raw.startsWith('+')) {
      result.push({
        type: 'added',
        content: raw.slice(1),
        newLine: newLine,
      });
      newLine++;
    } else if (raw.startsWith('-')) {
      result.push({
        type: 'removed',
        content: raw.slice(1),
        oldLine: oldLine,
      });
      oldLine++;
    } else {
      // Context line (starts with ' ' or is empty within hunk)
      const content = raw.startsWith(' ') ? raw.slice(1) : raw;
      // Only assign line numbers if we've entered a hunk
      if (oldLine > 0 || newLine > 0) {
        result.push({
          type: 'context',
          content,
          oldLine: oldLine,
          newLine: newLine,
        });
        oldLine++;
        newLine++;
      }
    }
  }

  return result;
}

/* ── i18n ── */

const i18n = {
  zh: {
    reject: '撤销',
    reapply: '重新应用',
    rejected: '已撤销',
    applied: '已应用',
  },
  en: {
    reject: 'Reject',
    reapply: 'Re-apply',
    rejected: 'Rejected',
    applied: 'Applied',
  },
} as const;

/* ── Component ── */

const DiffBlock: React.FC<DiffBlockProps> = ({
  filePath,
  diff,
  editId,
  status,
  onReject,
  onAccept,
  lang = 'en',
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const lines = useMemo(() => parseDiffLines(diff), [diff]);
  const t = i18n[lang];

  // Extract short file name for display
  const shortPath = filePath.replace(/\\/g, '/');

  return (
    <div className="dt-diff-container">
      {/* Header */}
      <div className="dt-diff-header">
        <FileEdit size={14} className="dt-diff-file-icon" />
        <span className="dt-diff-file-path" title={shortPath}>
          {shortPath}
        </span>
        <div className="dt-diff-header-actions">
          {status === 'applied' && onReject && (
            <button
              className="dt-diff-btn dt-diff-btn-reject"
              onClick={() => onReject(editId)}
              title={t.reject}
            >
              <Undo2 size={12} />
              {t.reject}
            </button>
          )}
          {status === 'rejected' && (
            onAccept ? (
              <button
                className="dt-diff-btn dt-diff-btn-accept"
                onClick={() => onAccept(editId)}
                title={t.reapply}
              >
                {t.reapply}
              </button>
            ) : (
              <span className="dt-diff-status-badge dt-diff-status-rejected">
                <X size={12} />
                {t.rejected}
              </span>
            )
          )}
          <button
            className="dt-diff-collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Diff body */}
      {!collapsed && (
        <div className="dt-diff-body">
          {lines.map((line, idx) => {
            const lineClass =
              line.type === 'added'
                ? 'dt-diff-line dt-diff-added'
                : line.type === 'removed'
                  ? 'dt-diff-line dt-diff-removed'
                  : line.type === 'header'
                    ? 'dt-diff-line dt-diff-header-line'
                    : 'dt-diff-line dt-diff-context';

            return (
              <div key={idx} className={lineClass}>
                {line.type === 'header' ? (
                  <>
                    <span className="dt-diff-gutter" />
                    <span className="dt-diff-gutter" />
                    <span className="dt-diff-content">{line.content}</span>
                  </>
                ) : (
                  <>
                    <span className="dt-diff-gutter">
                      {line.oldLine != null ? line.oldLine : ''}
                    </span>
                    <span className="dt-diff-gutter">
                      {line.newLine != null ? line.newLine : ''}
                    </span>
                    <span className="dt-diff-content">{line.content}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DiffBlock;
