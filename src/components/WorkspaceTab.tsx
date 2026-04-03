import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Switch,
  Typography,
} from '@mui/material';
import {
  FolderOpen,
  FolderClosed,
  File,
  RefreshCw,
  Unplug,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StateStore } from '../stores/state-store';
import {
  setRoot,
  getRootName,
  hasRoot,
  persistHandle,
  clearPersistedHandle,
  restoreHandle,
  listDirectory,
  type DirEntry,
} from '../background/tools/local-workspace';

interface Props {
  store: StateStore;
}

/* ── 文件树节点 ── */
const TreeNode: React.FC<{ entry: DirEntry; depth: number }> = ({ entry, depth }) => {
  const [expanded, setExpanded] = useState(depth < 1);

  if (entry.kind === 'directory') {
    return (
      <Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            pl: depth * 1.8,
            py: 0.5,
            cursor: 'pointer',
            borderRadius: '6px',
            transition: 'background 0.12s',
            '&:hover': { bgcolor: 'rgba(139,115,85,0.08)' },
          }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={13} style={{ color: '#aaa', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: '#aaa', flexShrink: 0 }} />}
          {expanded ? <FolderOpen size={14} style={{ color: '#c9a24e', flexShrink: 0 }} /> : <FolderClosed size={14} style={{ color: '#c9a24e', flexShrink: 0 }} />}
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{entry.name}</Typography>
        </Box>
        {expanded && entry.children && (
          <Box>
            {entry.children.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} />
            ))}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        pl: depth * 1.8 + 2,
        py: 0.35,
      }}
    >
      <File size={13} style={{ color: '#aaa', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 12.5, color: '#555' }}>{entry.name}</Typography>
    </Box>
  );
};

const WorkspaceTab: React.FC<Props> = observer(({ store }) => {
  const { t } = useTranslation();
  const [fileTree, setFileTree] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoreAttempted, setRestoreAttempted] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

  const isConnected = hasRoot();
  const rootName = getRootName();
  const isSupported = typeof window.showDirectoryPicker === 'function';

  // 尝试从 IndexedDB 恢复之前授权的 handle，若已连接则直接加载树
  useEffect(() => {
    if (restoreAttempted) return;
    setRestoreAttempted(true);
    if (isConnected && store.config.localFolderEnabled) {
      // 面板重新打开时自动刷新文件树
      loadTree();
    } else if (!isConnected && store.config.localFolderEnabled) {
      restoreHandle().then((ok) => {
        if (ok) {
          loadTree();
        } else {
          setRestoreFailed(true);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTree = useCallback(async () => {
    if (!hasRoot()) return;
    setLoading(true);
    try {
      const tree = await listDirectory('.', { recursive: true, maxDepth: 2 });
      setFileTree(tree);
    } catch (e) {
      console.warn('[G-Master] Failed to load file tree:', e);
      setFileTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectFolder = useCallback(async () => {
    if (!isSupported) return;
    try {
      const dirHandle = await window.showDirectoryPicker!({ mode: 'readwrite' });
      setRoot(dirHandle);
      await persistHandle();
      setRestoreFailed(false);
      // 自动启用工作区
      runInAction(() => {
        store.updateConfig({ localFolderEnabled: true });
        store.flushPersist();
      });
      await loadTree();
    } catch (e) {
      // 用户取消选择不算错误
      if ((e as DOMException)?.name !== 'AbortError') {
        console.warn('[G-Master] Folder selection failed:', e);
      }
    }
  }, [isSupported, loadTree, store]);

  const handleDisconnect = useCallback(async () => {
    setRoot(null);
    setFileTree(null);
    setRestoreFailed(false);
    await clearPersistedHandle();
    runInAction(() => {
      store.updateConfig({ localFolderEnabled: false });
      store.flushPersist();
    });
  }, [store]);

  const handleToggle = useCallback((enabled: boolean) => {
    runInAction(() => {
      store.updateConfig({ localFolderEnabled: enabled });
      store.flushPersist();
    });
  }, [store]);

  if (!isSupported) {
    return (
      <Box sx={{ p: 2.5, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 13, color: '#999' }}>
          {t('workspace_not_supported')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
      {/* ── 连接状态 & 开关 ── */}
      <Box sx={{ px: 2, py: 2, borderBottom: '1px solid #ebebeb' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
            {t('workspace_title')}
          </Typography>
          {isConnected && (
            <Switch
              size="small"
              checked={store.config.localFolderEnabled}
              onChange={(e) => handleToggle(e.target.checked)}
            />
          )}
        </Box>
        <Typography sx={{ fontSize: 12, color: '#888', mb: 1.5 }}>
          {t('workspace_desc')}
        </Typography>

        {isConnected ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              icon={<FolderOpen size={14} />}
              label={rootName}
              size="small"
              color="success"
              variant="outlined"
              sx={{ fontSize: 12, maxWidth: 160 }}
            />
            <Button
              size="small"
              variant="text"
              onClick={handleSelectFolder}
              sx={{ fontSize: 12, textTransform: 'none', minWidth: 0, color: '#8B7355', fontWeight: 500 }}
            >
              {t('workspace_change_folder')}
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={handleDisconnect}
              startIcon={<Unplug size={13} />}
              sx={{ fontSize: 12, textTransform: 'none', minWidth: 0, color: '#cf4a4a', fontWeight: 500 }}
            >
              {t('workspace_disconnect')}
            </Button>
          </Box>
        ) : (
          <Box>
            {restoreFailed && (
              <Typography sx={{ fontSize: 11, color: '#e67e22', mb: 1 }}>
                {t('workspace_restore_failed')}
              </Typography>
            )}
            <Button
              variant="outlined"
              size="small"
              onClick={handleSelectFolder}
              startIcon={<FolderOpen size={15} />}
              sx={{
                textTransform: 'none',
                fontSize: 13,
                fontWeight: 500,
                borderColor: '#d4c9b8',
                color: '#333',
                borderRadius: 999,
                px: 2,
                '&:hover': { borderColor: '#8B7355', bgcolor: 'rgba(139,115,85,0.05)' },
              }}
            >
              {t('workspace_select_folder')}
            </Button>
          </Box>
        )}
      </Box>

      {/* ── 文件树 ── */}
      {isConnected && store.config.localFolderEnabled && (
        <Box sx={{ px: 1.5, py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#8B7355', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {t('workspace_file_tree')}
            </Typography>
            <IconButton size="small" onClick={loadTree} disabled={loading}>
              <RefreshCw size={13} style={loading ? { animation: 'dtIconSpin 1s linear infinite' } : undefined} />
            </IconButton>
          </Box>
          <Divider sx={{ mb: 0.5 }} />
          <Box
            sx={{
              maxHeight: 'calc(80svh - 190px)',
              overflowY: 'auto',
              overflowX: 'hidden',
              '&::-webkit-scrollbar': { width: 4 },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.12)', borderRadius: 2 },
            }}
          >
            {loading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
                <Loader2 size={14} style={{ animation: 'dtIconSpin 1s linear infinite' }} />
                <Typography sx={{ fontSize: 11, color: '#999' }}>{t('workspace_loading')}</Typography>
              </Box>
            ) : fileTree && fileTree.length > 0 ? (
              fileTree.map((entry) => (
                <TreeNode key={entry.path} entry={entry} depth={0} />
              ))
            ) : (
              <Typography sx={{ fontSize: 11, color: '#ccc', p: 1 }}>
                {t('workspace_empty')}
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
});

export default WorkspaceTab;
