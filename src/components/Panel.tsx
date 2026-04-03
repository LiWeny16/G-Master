import React, { useState } from 'react';
import { runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { X, Loader2, CheckCircle2, Sparkles, Settings2, Info, Pin, Trash2, Plus, ChevronDown, ChevronUp, FolderOpen, Grid3X3, FileEdit } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StateStore } from '../stores/state-store';
import { DEFAULT_CONFIG, LoopModel } from '../types';
import { PersistService } from '../services/persist-service';
import WorkspaceTab from './WorkspaceTab';
import SudokuGame from './SudokuGame';
import EditHistoryPanel from './EditHistoryPanel';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

interface Props {
  store: StateStore;
  open: boolean;
  anchorPos: { x: number; y: number };
  allowAutoMode?: boolean;
  onClose: () => void;
  onAbort: () => void;
  onEditReject?: (editId: number) => void;
  onEditAccept?: (editId: number) => void;
}

const PANEL_THEME = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#8B7355' },
    secondary: { main: '#2e7d32' },
    background: { default: '#FAFAF8' },
  },
  typography: {
    fontFamily: "'Segoe UI', 'Inter', Roboto, sans-serif",
    fontSize: 12,
  },
  shape: {
    borderRadius: 8,
  },
});

/* ── 数字字段（带 ± 按钮） ── */
const NumField: React.FC<{
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min = 0, step = 1, onChange }) => (
  <Box className="dt-field" sx={{ mt: 1 }}>
    <Typography className="dt-field-label" sx={{ mb: 0.5 }}>{label}</Typography>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <IconButton
        size="small"
        onClick={() => onChange(Math.max(min, value - step))}
        sx={{ border: '1px solid #D4C9B8', borderRadius: '50%', width: 28, height: 28 }}
      >
        <Typography sx={{ fontSize: 16, lineHeight: 1 }}>-</Typography>
      </IconButton>
      <TextField
        variant="standard"
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(min, v));
        }}
        InputProps={{
          disableUnderline: true,
          inputProps: { min, step, style: { textAlign: 'center' } }
        }}
        sx={{
          flex: 1,
          '& .MuiInputBase-root': {
            borderRadius: '14px',
            backgroundColor: '#EBE5DB',
            height: 28,
            padding: 0,
          },
          '& input': {
            height: '28px',
            padding: 0,
            boxSizing: 'border-box'
          },
          // 隐藏原生 number 输入框自带的上下调整小箭头
          '& input[type=number]': {
            MozAppearance: 'textfield',
          },
          '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
          },
        }}
      />
      <IconButton
        size="small"
        onClick={() => onChange(value + step)}
        sx={{ border: '1px solid #D4C9B8', borderRadius: '50%', width: 28, height: 28 }}
      >
        <Typography sx={{ fontSize: 16, lineHeight: 1 }}>+</Typography>
      </IconButton>
    </Box>
  </Box>
);

const GitHubIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.649.5.5 5.649.5 12A11.5 11.5 0 0 0 8.36 22.92c.575.106.785-.25.785-.556 0-.274-.01-1-.016-1.962-3.198.695-3.873-1.542-3.873-1.542-.523-1.328-1.277-1.681-1.277-1.681-1.044-.714.08-.699.08-.699 1.154.081 1.761 1.185 1.761 1.185 1.026 1.758 2.692 1.25 3.348.956.104-.743.402-1.25.731-1.537-2.553-.29-5.238-1.277-5.238-5.683 0-1.255.449-2.281 1.184-3.085-.119-.29-.513-1.457.112-3.038 0 0 .965-.309 3.162 1.178A10.98 10.98 0 0 1 12 6.032c.972.005 1.95.132 2.864.388 2.195-1.487 3.159-1.178 3.159-1.178.627 1.581.233 2.748.114 3.038.738.804 1.183 1.83 1.183 3.085 0 4.417-2.689 5.389-5.252 5.673.413.356.781 1.059.781 2.135 0 1.541-.014 2.784-.014 3.164 0 .309.207.668.79.555A11.502 11.502 0 0 0 23.5 12C23.5 5.649 18.351.5 12 .5Z" />
  </svg>
);

/* ── 核心记忆卡片列表 (MemoryCardList) ── */
const MemoryCardList: React.FC<{ store: StateStore }> = observer(({ store }) => {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const memories = store.config.pinnedMemories || [];

  const handleAdd = () => {
    const newId = Date.now().toString();
    store.updateConfig({
      pinnedMemories: [
        ...memories,
        { id: newId, enabled: true, title: t('panel_memory_new'), content: '' }
      ]
    });
    store.flushPersist(); // Fix for Issue 1: flush immediately on add
    setExpandedId(newId);
  };

  const updateMemory = (id: string, updates: Partial<{ title: string; content: string; enabled: boolean }>) => {
    const newMems = memories.map(m => m.id === id ? { ...m, ...updates } : { ...m });
    store.updateConfig({ pinnedMemories: newMems });
    if (updates.enabled !== undefined) {
      store.flushPersist(); // immediate flush on toggle
    }
  };

  const removeMemory = (id: string) => {
    const newMems = memories.filter(m => m.id !== id).map(m => ({ ...m }));
    store.updateConfig({ pinnedMemories: newMems });
    store.flushPersist();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {memories.map((mem) => {
        const isExpanded = expandedId === mem.id;
        return (
          <Box
            key={mem.id}
            sx={{
              border: `1px solid ${mem.enabled ? 'rgba(139,115,85,0.2)' : '#e0e0e0'}`,
              borderRadius: '12px',
              bgcolor: mem.enabled ? 'rgba(139,115,85,0.03)' : '#fcfcfc',
              overflow: 'hidden',
              transition: 'all 0.2s',
              boxShadow: isExpanded ? '0 4px 12px rgba(0,0,0,0.03)' : 'none',
              opacity: mem.enabled ? 1 : 0.7,
            }}
          >
            {/* Header / Condensed View */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                p: 1.2,
                cursor: 'pointer',
                gap: 1.5,
              }}
              onClick={() => setExpandedId(isExpanded ? null : mem.id)}
            >
              <Switch
                size="small"
                checked={mem.enabled}
                onChange={(e) => updateMemory(mem.id, { enabled: e.target.checked })}
                onClick={(e) => e.stopPropagation()}
                sx={{ ml: 0.5 }}
              />
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: mem.enabled ? '#8B7355' : '#666' }}>
                  {mem.title || t('panel_memory_unnamed')}
                </Typography>
                {/* 截断的内容预览 */}
                {!isExpanded && mem.content && (
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: '#999',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '120px'
                    }}
                  >
                    - {mem.content}
                  </Typography>
                )}
              </Box>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMemory(mem.id);
                }}
                sx={{ color: '#ff6b6b', opacity: 0.6, '&:hover': { opacity: 1, bgcolor: 'rgba(255,107,107,0.1)' } }}
              >
                <Trash2 size={14} />
              </IconButton>
              <Box sx={{ color: '#ccc', display: 'flex', alignItems: 'center' }}>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Box>
            </Box>

            {/* Expanded Content Area */}
            {isExpanded && (
              <Box sx={{ p: 1.5, pt: 0, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                <TextField
                  fullWidth
                  variant="standard"
                  placeholder={t('panel_memory_title_placeholder')}
                  value={mem.title}
                  onChange={(e) => updateMemory(mem.id, { title: e.target.value })}
                  onBlur={() => store.flushPersist()}
                  onClick={(e) => e.stopPropagation()}
                  sx={{ mb: 1, mt: 1, '& .MuiInputBase-input': { fontSize: 13, fontWeight: 600, color: '#333' } }}
                  InputProps={{ disableUnderline: true }}
                />
                <TextField
                  multiline
                  minRows={2}
                  maxRows={8}
                  placeholder={t('panel_memory_content_placeholder')}
                  value={mem.content}
                  onChange={(e) => updateMemory(mem.id, { content: e.target.value })}
                  onBlur={() => store.flushPersist()}
                  onClick={(e) => e.stopPropagation()}
                  fullWidth
                  variant="outlined"
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontSize: 12,
                      backgroundColor: mem.enabled ? '#fff' : '#f5f5f5',
                      borderRadius: '8px',
                      '& fieldset': { borderColor: 'rgba(0,0,0,0.08)' },
                      '&:hover fieldset': { borderColor: 'rgba(139,115,85,0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#8B7355' }
                    }
                  }}
                />
              </Box>
            )}
          </Box>
        );
      })}

      <Button
        variant="text"
        size="small"
        onClick={handleAdd}
        sx={{
          color: '#8B7355',
          bgcolor: 'rgba(139,115,85,0.05)',
          borderRadius: '8px',
          py: 1,
          '&:hover': { bgcolor: 'rgba(139,115,85,0.1)' },
          display: 'flex',
          gap: 1
        }}
      >
        <Plus size={16} /> {t('panel_memory_add')}
      </Button>
    </Box>
  );
});

/* ── 产品标志 (蓝色四棱星) ── */
const ProductLogo: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2L14.09 9.91L22 12L14.09 14.09L12 22L9.91 14.09L2 12L9.91 9.91L12 2Z"
      fill="url(#gm-star-grad)" />
    <defs>
      <linearGradient id="gm-star-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#42A5F5" />
        <stop offset="1" stopColor="#1565C0" />
      </linearGradient>
    </defs>
  </svg>
);

type TabType = 'workspace' | 'settings' | 'edits' | 'sudoku' | 'about';

const TAB_CONFIG: Array<{ value: TabType; icon: React.ReactNode; labelKey: string }> = [
  { value: 'workspace', icon: <FolderOpen size={15} />, labelKey: 'panel_tab_workspace' },
  { value: 'edits',     icon: <FileEdit size={15} />,   labelKey: 'panel_tab_edits'     },
  { value: 'settings',  icon: <Settings2 size={15} />,  labelKey: 'panel_tab_settings'  },
  { value: 'sudoku',    icon: <Grid3X3 size={15} />,    labelKey: 'panel_tab_sudoku'    },
  { value: 'about',     icon: <Info size={15} />,       labelKey: 'panel_tab_about'     },
];

const Panel: React.FC<Props> = observer(({ store, open, anchorPos, allowAutoMode = true, onClose, onAbort, onEditReject, onEditAccept }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('workspace');

  if (!open) return null;

  const panelH = Math.round(window.innerHeight * 0.8);
  const panelStyle: React.CSSProperties = {
    left: Math.min(anchorPos.x + 56, window.innerWidth - 372),
    top: Math.max(8, Math.min(anchorPos.y - 20, window.innerHeight - panelH - 8)),
    height: '80svh',
    overflow: 'hidden',
  };

  const isActive = store.isAgentEnabled;
  const displayedMode = !allowAutoMode && store.agentMode === 'auto' ? 'on' : store.agentMode;

  const handleModeChange = (mode: 'off' | 'on' | 'auto') => {
    if (mode === 'off' && isActive) {
      onAbort();
    }
    store.setAgentMode(mode);
  };

  const handleResetAll = () => {
    void PersistService.clear().then(() => {
      runInAction(() => {
        store.config = { ...DEFAULT_CONFIG };
      });
    }).catch(() => {
      runInAction(() => {
        store.config = { ...DEFAULT_CONFIG };
      });
    });
  };

  return (
    <ThemeProvider theme={PANEL_THEME}>
      <div id="dt-panel-overlay" onClick={onClose} />
      <div id="dt-panel" style={panelStyle}>

        {/* ── 头部 ── */}
        <div className="dt-panel-header">
          {/* 左：产品 Logo + 名称 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <ProductLogo size={16} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F5F0E8', letterSpacing: '-0.01em' }}>
              G-Master
            </span>
          </div>

          {/* 中：图标式 Tab 导航 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center' }}>
            {TAB_CONFIG.map(({ value, icon, labelKey }) => {
              const isAct = activeTab === value;
              return (
                <button
                  key={value}
                  title={t(labelKey)}
                  onClick={() => setActiveTab(value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: 'none',
                    background: isAct ? 'rgba(245,240,232,0.14)' : 'transparent',
                    color: isAct ? '#F5F0E8' : 'rgba(245,240,232,0.40)',
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
                    outline: 'none',
                    boxShadow: isAct ? 'inset 0 -2px 0 rgba(139,115,85,0.85)' : 'none',
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </button>
              );
            })}
          </div>

          {/* 右：关闭按钮 */}
          <div className="dt-panel-close" onClick={onClose} role="button" tabIndex={0} style={{ flexShrink: 0 }}>
            <X size={15} />
          </div>
        </div>

        {/* ── 内容区（固定高度，各路由内部独立滚动）── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {activeTab === 'workspace' && (
            <WorkspaceTab store={store} />
          )}

          {activeTab === 'edits' && (
            <EditHistoryPanel store={store} onReject={onEditReject} onAccept={onEditAccept} />
          )}

          {activeTab === 'sudoku' && (
            <SudokuGame />
          )}

          {activeTab === 'about' && (
            <Box className="dt-panel-body" sx={{ flex: 1, p: 2.5, textAlign: 'center', overflowY: 'auto' }}>
              <ProductLogo size={44} />
              <Typography variant="h6" sx={{ mb: 0.8, color: '#1a1a1a', mt: 1.5 }}>G-Master</Typography>
              <Typography sx={{ fontSize: 13, color: '#666', mb: 2.2 }}>
                {t('panel_about_desc')}
              </Typography>
              <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 700, color: '#333' }}>{t('panel_about_author')}</Typography>
                <Typography sx={{ mt: 0.5, fontSize: 12, color: '#888' }}>from NUS MIT</Typography>
              </Box>
              <Button
                component="a"
                href="https://github.com/LiWeny16/G-Master"
                target="_blank"
                rel="noreferrer"
                variant="outlined"
                startIcon={<GitHubIcon size={16} />}
                sx={{
                  mt: 2,
                  borderColor: '#d4c9b8',
                  color: '#333',
                  borderRadius: 999,
                  textTransform: 'none',
                  px: 2,
                  '&:hover': {
                    borderColor: '#8B7355',
                    bgcolor: 'rgba(139,115,85,0.05)'
                  }
                }}
              >
                {t('panel_about_github')}
              </Button>
            </Box>
          )}

        {activeTab === 'settings' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
            {/* ── 主开关行 ── */}
            <Box className="dt-toggle-row" sx={{ borderBottom: '1px solid #ebebeb', gap: 1 }}>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={displayedMode}
                sx={{ width: '100%' }}
                onChange={(_event, value) => {
                  const nextMode = value as 'off' | 'on' | 'auto' | null;
                  if (nextMode) handleModeChange(nextMode);
                }}
              >
                <ToggleButton sx={{ flex: 1, whiteSpace: 'nowrap' }} value="off">{t('panel_mode_off')}</ToggleButton>
                <ToggleButton sx={{ flex: 1, whiteSpace: 'nowrap' }} value="on">{t('panel_mode_on')}</ToggleButton>
                {allowAutoMode && (
                  <ToggleButton sx={{ flex: 1, whiteSpace: 'nowrap' }} value="auto">{t('panel_mode_auto')}</ToggleButton>
                )}
              </ToggleButtonGroup>
            </Box>

            {/* ── 运行状态 ── */}
            {isActive && (store.currentLoop > 0 || store.isSummarizing) && (
              <Box className={`dt-status-row${store.isSummarizing ? ' dt-sum' : ''}`}>
                <Box className="dt-status-dot" />
                {store.isSummarizing ? (
                  <>
                    <Sparkles size={12} style={{ color: '#6B8B6B' }} />
                    <Typography className="dt-status-text">{t('panel_status_summarizing')}</Typography>
                  </>
                ) : (
                  <>
                    <Loader2 size={12} style={{ color: '#8B7355', animation: 'dtIconSpin 1s linear infinite' }} />
                    <Typography className="dt-status-text">{t('panel_status_thinking', { loop: Math.max(1, store.currentLoop) })}</Typography>
                  </>
                )}
              </Box>
            )}

            {/* ── 配置正文 ── */}
            <Stack className="dt-panel-body" spacing={1.4}>

              <Typography className="dt-section-label">{t('panel_agent_config')} </Typography>

              <TextField
                label={t('settings_tavily_key')}
                type="password"
                placeholder={t('panel_tavily_placeholder')}
                value={store.config.tavilyApiKey}
                onChange={(e) => store.updateConfig({ tavilyApiKey: e.target.value })}
                fullWidth
                size="small"
              />
              <Typography sx={{ fontSize: 11, color: '#666' }}>
                {t('settings_tavily_desc')}
              </Typography>
              {!store.config.tavilyApiKey && store.config.tavilyEnabled && (
                <Alert severity="warning" sx={{ py: 0.2, '& .MuiAlert-message': { fontSize: 11 } }}>
                  {t('settings_tavily_warn')}
                </Alert>
              )}

              <Divider sx={{ my: 0.8 }} />
              <Typography className="dt-section-label" sx={{ mt: 0.6 }}>
                <Pin size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {t('panel_memory_title')}
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#666', mb: 1 }}>
                {t('panel_memory_desc')}
              </Typography>
              <MemoryCardList store={store} />

              <Divider sx={{ my: 0.8 }} />
              <Typography className="dt-section-label" sx={{ mt: 0.6 }}>
                <Settings2 size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {t('settings_loop')}
              </Typography>

              <TextField
                select
                label={t('settings_language')}
                value={store.config.language || 'zh'}
                onChange={(e) => store.updateConfig({ language: e.target.value as 'zh' | 'en' })}
                size="small"
                fullWidth
                SelectProps={{
                  MenuProps: { style: { zIndex: 2147483647 } }
                }}
              >
                <MenuItem value="zh">简体中文</MenuItem>
                <MenuItem value="en">English</MenuItem>
              </TextField>

              <TextField
                select
                label={t('settings_loop_model')}
                value={store.config.loopModel}
                onChange={(e) => store.updateConfig({ loopModel: e.target.value as LoopModel })}
                size="small"
                fullWidth
                SelectProps={{
                  MenuProps: {
                    style: { zIndex: 2147483647 }, // 提升层级，保证能显示在最前面
                  },
                }}
              >
                <MenuItem value="fast">{t('settings_model_fast')}</MenuItem>
                <MenuItem value="think">{t('settings_model_think')}</MenuItem>
                <MenuItem value="pro">{t('settings_model_pro')}</MenuItem>
              </TextField>

              <NumField
                label={t('settings_max_loops')}
                value={store.config.maxLoops}
                min={1}
                onChange={(v) => store.updateConfig({ maxLoops: v })}
              />
              <NumField
                label={t('settings_min_loops')}
                value={store.config.minLoops}
                min={1}
                onChange={(v) => store.updateConfig({ minLoops: v })}
              />
              <NumField
                label={t('settings_loop_delay')}
                value={store.config.loopDelay}
                min={0}
                step={100}
                onChange={(v) => store.updateConfig({ loopDelay: v })}
              />

              <Divider sx={{ my: 0.8 }} />
              <Typography className="dt-section-label" sx={{ mt: 0.6 }}>
                <CheckCircle2 size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {t('settings_review_phases')}
              </Typography>

              <TextField
                label={t('settings_review_placeholder')}
                multiline
                minRows={6}
                value={(Array.isArray(store.config.reviewPhases) ? store.config.reviewPhases : []).join('\n')}
                onChange={(e) => {
                  const phases = e.target.value.split('\n').filter((s) => s.trim());
                  if (phases.length > 0) store.updateConfig({ reviewPhases: phases });
                }}
                fullWidth
              />

              <Typography className="dt-section-label" sx={{ mt: 1.2 }}>
                {t('settings_system_prompt')}
              </Typography>

              <TextField
                multiline
                minRows={9}
                value={store.config.systemPromptTemplate}
                onChange={(e) => store.updateConfig({ systemPromptTemplate: e.target.value })}
                onBlur={() => store.flushPersist()}
                fullWidth
              />

              <Box sx={{ mt: 1.2, textAlign: 'center' }}>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={handleResetAll}
                >
                  {t('settings_reset_all')}
                </Button>
              </Box>

            </Stack>
          </Box>
        )}

        </div>{/* ── 内容区结束 ── */}
      </div>
    </ThemeProvider>
  );
});

export default Panel;
