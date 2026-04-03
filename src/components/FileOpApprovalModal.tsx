/**
 * FileOpApprovalModal.tsx
 *
 * 文件操作审批弹窗 — 当 AI 请求执行写操作（创建/重命名/移动/删除/建目录）时，
 * 必须由用户明确批准后才可执行。
 *
 * 渲染位置：通过 createPortal 挂载到 document.body，保证不被 overflow:hidden 裁剪。
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  Box,
  Button,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import {
  FilePlus2,
  FolderPlus,
  Pencil,
  MoveRight,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import type { StateStore } from '../stores/state-store';
import type { PendingFileOp } from '../types';

interface Props {
  store: StateStore;
  onApprove: (opId: string) => void;
  onReject: (opId: string) => void;
}

const THEME = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2e7d32' },
    error: { main: '#c62828' },
    background: { default: '#FAFAF8' },
  },
  typography: {
    fontFamily: "'Segoe UI', 'Inter', Roboto, sans-serif",
    fontSize: 13,
  },
  shape: { borderRadius: 10 },
});

// ── 各操作类型的显示配置 ──

interface OpMeta {
  icon: React.ReactNode;
  label: string;
  color: string;
  danger?: boolean;
}

function getOpMeta(op: PendingFileOp, lang: 'zh' | 'en'): OpMeta {
  const isZh = lang === 'zh';
  switch (op.type) {
    case 'create_file':
    case 'write_local_file':
      return {
        icon: <FilePlus2 size={16} />,
        label: isZh ? '创建文件' : 'Create File',
        color: '#1565c0',
      };
    case 'rename_file':
      return {
        icon: <Pencil size={16} />,
        label: isZh ? '重命名文件' : 'Rename File',
        color: '#6a1b9a',
      };
    case 'move_file':
      return {
        icon: <MoveRight size={16} />,
        label: isZh ? '移动文件' : 'Move File',
        color: '#e65100',
      };
    case 'create_directory':
      return {
        icon: <FolderPlus size={16} />,
        label: isZh ? '创建文件夹' : 'Create Directory',
        color: '#1565c0',
      };
    case 'delete_file':
      return {
        icon: <Trash2 size={16} />,
        label: isZh ? '删除文件' : 'Delete File',
        color: '#c62828',
        danger: true,
      };
    case 'batch_rename':
      return {
        icon: <MoveRight size={16} />,
        label: isZh ? '批量重命名' : 'Batch Rename',
        color: '#e65100',
      };
  }
}

// ── 操作详情渲染 ──

function PathChip({ path }: { path: string }) {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
  const dir = path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  return (
    <Chip
      label={
        <span>
          {dir ? <span style={{ opacity: 0.55, fontSize: '0.85em' }}>{dir}/</span> : null}
          <strong>{name}</strong>
        </span>
      }
      size="small"
      sx={{
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        maxWidth: '90%',
        height: 'auto',
        '& .MuiChip-label': { whiteSpace: 'normal', wordBreak: 'break-all', padding: '4px 8px' },
        background: 'rgba(0,0,0,0.06)',
        border: '1px solid rgba(0,0,0,0.12)',
      }}
    />
  );
}

function OpDetails({ op, lang }: { op: PendingFileOp; lang: 'zh' | 'en' }) {
  const isZh = lang === 'zh';
  const { args } = op;

  switch (op.type) {
    case 'create_file':
    case 'write_local_file': {
      const path = typeof args.path === 'string' ? args.path : '?';
      const content = typeof args.content === 'string' ? args.content : '';
      const lines = content.split('\n').length;
      const bytes = new Blob([content]).size;
      return (
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">
            {isZh ? '目标路径' : 'Target path'}
          </Typography>
          <PathChip path={path} />
          <Typography variant="caption" color="text.secondary">
            {isZh ? `内容：${lines} 行 / ${bytes} 字节` : `Content: ${lines} lines / ${bytes} bytes`}
          </Typography>
        </Stack>
      );
    }
    case 'rename_file': {
      const oldPath = typeof args.path === 'string' ? args.path : '?';
      const newName = typeof args.newName === 'string' ? args.newName : '?';
      const dir = oldPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
      const newPath = dir ? `${dir}/${newName}` : newName;
      return (
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">
            {isZh ? '原路径' : 'From'}
          </Typography>
          <PathChip path={oldPath} />
          <Typography variant="caption" color="text.secondary">
            {isZh ? '新名称' : 'To'}
          </Typography>
          <PathChip path={newPath} />
        </Stack>
      );
    }
    case 'move_file': {
      const src = typeof args.srcPath === 'string' ? args.srcPath : '?';
      const dest = typeof args.destPath === 'string' ? args.destPath : '?';
      return (
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">
            {isZh ? '原路径' : 'From'}
          </Typography>
          <PathChip path={src} />
          <Typography variant="caption" color="text.secondary">
            {isZh ? '目标路径' : 'To'}
          </Typography>
          <PathChip path={dest} />
        </Stack>
      );
    }
    case 'create_directory': {
      const path = typeof args.path === 'string' ? args.path : '?';
      return (
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">
            {isZh ? '目录路径' : 'Directory path'}
          </Typography>
          <PathChip path={path} />
        </Stack>
      );
    }
    case 'delete_file': {
      const path = typeof args.path === 'string' ? args.path : '?';
      return (
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">
            {isZh ? '将被删除的文件（不可恢复！）' : 'File to delete (cannot be undone!)'}
          </Typography>
          <PathChip path={path} />
        </Stack>
      );
    }
    case 'batch_rename': {
      const renames = Array.isArray(args.renames)
        ? (args.renames as { from: string; to: string }[]).filter(
            r => typeof r.from === 'string' && typeof r.to === 'string',
          )
        : [];
      return (
        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">
            {isZh ? `共 ${renames.length} 项操作：` : `${renames.length} operations:`}
          </Typography>
          <Box sx={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {renames.map((r, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <PathChip path={r.from} />
                <Typography variant="caption" sx={{ opacity: 0.5 }}>→</Typography>
                <PathChip path={r.to} />
              </Box>
            ))}
          </Box>
        </Stack>
      );
    }
  }
}

// ── 主组件 ──

const FileOpApprovalModal: React.FC<Props> = observer(({ store, onApprove, onReject }) => {
  const pendingOps = store.pendingFileOps;
  const op = pendingOps.length > 0 ? pendingOps[0] : null;
  const rejectRef = useRef<HTMLButtonElement>(null);

  // 弹窗出现时焦点锁定到"拒绝"按钮（更安全的默认）
  useEffect(() => {
    if (op) {
      setTimeout(() => rejectRef.current?.focus(), 80);
    }
  }, [op?.id]);

  if (!op) return null;

  const lang = store.config.language;
  const isZh = lang === 'zh';
  const meta = getOpMeta(op, lang);

  const modal = (
    <ThemeProvider theme={THEME}>
      {/* 背景遮罩 */}
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147483646,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
        onClick={(e) => {
          // 点击遮罩 = 拒绝（不误触）
          if (e.target === e.currentTarget) onReject(op.id);
        }}
      >
        {/* 弹窗卡片 */}
        <Box
          sx={{
            background: '#fff',
            borderRadius: '14px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            padding: '20px 22px 18px',
            maxWidth: 440,
            width: '100%',
            border: meta.danger ? '1.5px solid rgba(198,40,40,0.3)' : '1px solid rgba(0,0,0,0.1)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题行 */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Box sx={{ color: meta.color, display: 'flex', alignItems: 'center' }}>
              {meta.icon}
            </Box>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: '0.95rem',
                color: meta.danger ? '#c62828' : '#1a1a1a',
                flex: 1,
              }}
            >
              {meta.label}
            </Typography>
            <Chip
              label="AI"
              size="small"
              sx={{
                background: 'rgba(0,0,0,0.06)',
                fontSize: '0.7rem',
                height: 20,
                fontWeight: 500,
              }}
            />
          </Stack>

          {/* 描述 */}
          <Typography variant="body2" sx={{ mb: 2, color: '#444', lineHeight: 1.5 }}>
            {isZh
              ? 'AI 正在请求执行以下文件操作，请确认是否允许：'
              : 'The AI is requesting the following file operation. Allow it?'}
          </Typography>

          {/* 操作详情 */}
          <Box
            sx={{
              background: meta.danger ? 'rgba(198,40,40,0.04)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${meta.danger ? 'rgba(198,40,40,0.15)' : 'rgba(0,0,0,0.08)'}`,
              borderRadius: '8px',
              padding: '12px 14px',
              mb: 2,
            }}
          >
            <OpDetails op={op} lang={lang} />
          </Box>

          {/* 删除警告 */}
          {meta.danger && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                background: 'rgba(198,40,40,0.06)',
                border: '1px solid rgba(198,40,40,0.2)',
                borderRadius: '8px',
                padding: '10px 12px',
                mb: 2,
              }}
            >
              <AlertTriangle size={14} style={{ color: '#c62828', flexShrink: 0, marginTop: 2 }} />
              <Typography variant="caption" sx={{ color: '#c62828', lineHeight: 1.5 }}>
                {isZh
                  ? '删除操作不可撤销，文件将被永久移除。'
                  : 'This action cannot be undone. The file will be permanently deleted.'}
              </Typography>
            </Box>
          )}

          {/* 操作按钮 */}
          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button
              ref={rejectRef}
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<XCircle size={14} />}
              onClick={() => onReject(op.id)}
              sx={{
                textTransform: 'none',
                borderColor: 'rgba(0,0,0,0.2)',
                color: '#555',
                fontSize: '0.82rem',
                '&:hover': { borderColor: '#c62828', color: '#c62828', background: 'rgba(198,40,40,0.04)' },
              }}
            >
              {isZh ? '拒绝' : 'Reject'}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<CheckCircle2 size={14} />}
              onClick={() => onApprove(op.id)}
              sx={{
                textTransform: 'none',
                background: meta.danger ? '#c62828' : '#2e7d32',
                fontSize: '0.82rem',
                boxShadow: 'none',
                '&:hover': {
                  background: meta.danger ? '#b71c1c' : '#1b5e20',
                  boxShadow: 'none',
                },
              }}
            >
              {isZh ? '允许执行' : 'Allow'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  );

  return createPortal(modal, document.body);
});

export default FileOpApprovalModal;
