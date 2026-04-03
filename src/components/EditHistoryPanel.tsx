import React from 'react';
import { observer } from 'mobx-react-lite';
import { FileEdit, Undo2, Check, Clock, Trash2 } from 'lucide-react';
import { StateStore } from '../stores/state-store';
import { clearSession } from '../background/tools/edit-history';
import { useTranslation } from 'react-i18next';

interface EditHistoryPanelProps {
  store: StateStore;
  onReject?: (editId: number) => void;
  onAccept?: (editId: number) => void;
}

const COLORS = {
  bg: '#F5F0E8',
  cardBg: '#FAFAF8',
  border: '#EBE5DB',
  primary: '#8B7355',
  textPrimary: '#1a1a1a',
  textSecondary: '#6B5E4F',
  textMuted: '#999',
  badgeApplied: '#2e7d32',
  badgeAppliedBg: '#e8f5e9',
  badgeRejected: '#999',
  badgeRejectedBg: '#f0f0f0',
  dangerText: '#c0392b',
  dangerBg: '#fdf2f0',
};

const EditHistoryPanel: React.FC<EditHistoryPanelProps> = observer(({ store, onReject, onAccept: _onAccept }) => {
  const { t } = useTranslation();
  const edits = store.pendingEdits ?? [];
  const sortedEdits = [...edits].sort((a, b) => b.timestamp - a.timestamp);

  const handleClear = async () => {
    if (!store.editSessionId) return;
    try {
      await clearSession(store.editSessionId);
      store.pendingEdits.splice(0, store.pendingEdits.length);
    } catch (e) {
      console.error('[G-Master] Clear session failed:', e);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      backgroundColor: COLORS.bg,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid ${COLORS.border}`,
        backgroundColor: COLORS.cardBg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileEdit size={16} color={COLORS.primary} />
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
            {t('panel_edit_history_title', '编辑历史')}
          </span>
          {sortedEdits.length > 0 && (
            <span style={{
              fontSize: 11,
              color: COLORS.primary,
              backgroundColor: COLORS.border,
              borderRadius: 10,
              padding: '1px 8px',
              fontWeight: 500,
            }}>
              {sortedEdits.length}
            </span>
          )}
        </div>
        {sortedEdits.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: COLORS.dangerText,
              backgroundColor: COLORS.dangerBg,
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Trash2 size={12} />
            {t('panel_edit_history_clear', '清空历史')}
          </button>
        )}
      </div>

      {/* Scrollable list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 12px',
      }}>
        {sortedEdits.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 16px',
            color: COLORS.textMuted,
          }}>
            <Clock size={32} strokeWidth={1.5} />
            <span style={{ fontSize: 13, marginTop: 12 }}>
              {t('panel_edit_history_empty', '暂无编辑记录')}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedEdits.map((edit) => {
              const isApplied = edit.status === 'applied';
              return (
                <div
                  key={edit.id}
                  style={{
                    backgroundColor: COLORS.cardBg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    transition: 'box-shadow 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(139,115,85,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                >
                  {/* File path */}
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: COLORS.textPrimary,
                    marginBottom: 6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  }}>
                    {edit.path}
                  </div>
                  {/* Bottom row: timestamp + status + action */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                      {formatTime(edit.timestamp)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isApplied ? (
                        <>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 11,
                            color: COLORS.badgeApplied,
                            backgroundColor: COLORS.badgeAppliedBg,
                            borderRadius: 4,
                            padding: '2px 6px',
                          }}>
                            <Check size={10} />
                            {t('panel_edit_status_applied', '已应用')}
                          </span>
                          <button
                            onClick={() => edit.id != null && onReject?.(edit.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: 11,
                              color: COLORS.primary,
                              backgroundColor: 'transparent',
                              border: `1px solid ${COLORS.primary}`,
                              borderRadius: 4,
                              padding: '2px 8px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.backgroundColor = COLORS.primary;
                              e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = COLORS.primary;
                            }}
                          >
                            <Undo2 size={10} />
                            {t('panel_edit_action_reject', '撤销')}
                          </button>
                        </>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 11,
                          color: COLORS.badgeRejected,
                          backgroundColor: COLORS.badgeRejectedBg,
                          borderRadius: 4,
                          padding: '2px 6px',
                        }}>
                          <Undo2 size={10} />
                          {t('panel_edit_status_rejected', '已撤销')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

export default EditHistoryPanel;
