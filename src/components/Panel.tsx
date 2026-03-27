import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Bot, X, Loader2, CheckCircle2, Sparkles, Settings2, Info } from 'lucide-react';
import { StateStore } from '../stores/state-store';
import { DEFAULT_CONFIG, LoopModel } from '../types';
import { PersistService } from '../services/persist-service';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
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
  onClose: () => void;
  onAbort: () => void;
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
    <Typography className="dt-field-label">{label}</Typography>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <IconButton
        size="small"
        onClick={() => onChange(Math.max(min, value - step))}
        sx={{ border: '1px solid #D4C9B8', borderRadius: 1.5 }}
      >
        -
      </IconButton>
      <TextField
        type="number"
        size="small"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(min, v));
        }}
        inputProps={{ min, step }}
        sx={{ flex: 1 }}
      />
      <IconButton
        size="small"
        onClick={() => onChange(value + step)}
        sx={{ border: '1px solid #D4C9B8', borderRadius: 1.5 }}
      >
        +
      </IconButton>
    </Box>
  </Box>
);

const Panel: React.FC<Props> = observer(({ store, open, anchorPos, onClose, onAbort }) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'about'>('settings');

  if (!open) return null;

  const panelStyle: React.CSSProperties = {
    left: Math.min(anchorPos.x + 56, window.innerWidth - 372),
    top: Math.max(8, Math.min(anchorPos.y - 20, window.innerHeight - 520)),
    display: 'flex',
    flexDirection: 'column',
    overflow: 'scroll'
  };

  const isActive = store.isAgentEnabled;

  const handleModeChange = (mode: 'off' | 'on' | 'auto') => {
    if (mode === 'off' && isActive) {
      onAbort();
    }
    store.setAgentMode(mode);
  };

  const handleResetAll = () => {
    void PersistService.clear().then(() => {
      store.config = { ...DEFAULT_CONFIG };
    }).catch(() => {
      store.config = { ...DEFAULT_CONFIG };
    });
  };

  return (
    <ThemeProvider theme={PANEL_THEME}>
      <div id="dt-panel-overlay" onClick={onClose} />
      <div id="dt-panel" style={panelStyle}>

        {/* ── 头部 ── */}
        <div className="dt-panel-header">
          <div className="dt-panel-title" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Bot size={16} />
              G-Master
            </div>
            <Tabs
              value={activeTab}
              onChange={(_event, value: 'settings' | 'about') => setActiveTab(value)}
              textColor="inherit"
              indicatorColor="secondary"
              sx={{ minHeight: 24, '& .MuiTab-root': { minHeight: 24, px: 1.2, fontSize: 12 } }}
            >
              <Tab value="settings" label="设置" />
              <Tab value="about" label="关于" />
            </Tabs>
          </div>
          <div className="dt-panel-close" onClick={onClose} role="button" tabIndex={0}>
            <X size={16} />
          </div>
        </div>

        {activeTab === 'about' && (
          <Box className="dt-panel-body" sx={{ flex: 1, p: 2.5, textAlign: 'center' }}>
            <Info size={44} style={{ color: '#8B7355', margin: '0 auto 14px auto', display: 'block' }} />
            <Typography variant="h6" sx={{ mb: 0.8, color: '#1a1a1a' }}>G-Master 深度思考</Typography>
            <Typography sx={{ fontSize: 13, color: '#666', mb: 2.2 }}>
              一个为 Gemini 注入深度思考和 Agent 能力的扩展。
            </Typography>
            <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
              <Typography sx={{ fontWeight: 700, color: '#333' }}>作者：Onion</Typography>
              <Typography sx={{ mt: 0.5, fontSize: 12, color: '#888' }}>from NUS MIT</Typography>
            </Box>
          </Box>
        )}

        {activeTab === 'settings' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
            {/* ── 主开关行 ── */}
            <Box className="dt-toggle-row" sx={{ borderBottom: '1px solid #ebebeb', gap: 1 }}>
              <Typography className="dt-toggle-label">运行模式</Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={store.agentMode}
                onChange={(_event, value) => {
                  const nextMode = value as 'off' | 'on' | 'auto' | null;
                  if (nextMode) handleModeChange(nextMode);
                }}
              >
                <ToggleButton value="off">关闭</ToggleButton>
                <ToggleButton value="on">深度思考(ON)</ToggleButton>
                <ToggleButton value="auto">Agent(AUTO)</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* ── 运行状态 ── */}
            {isActive && (store.currentLoop > 0 || store.isSummarizing) && (
              <Box className={`dt-status-row${store.isSummarizing ? ' dt-sum' : ''}`}>
                <Box className="dt-status-dot" />
                {store.isSummarizing ? (
                  <>
                    <Sparkles size={12} style={{ color: '#6B8B6B' }} />
                    <Typography className="dt-status-text">正在生成最终总结…</Typography>
                  </>
                ) : (
                  <>
                    <Loader2 size={12} style={{ color: '#8B7355', animation: 'dtIconSpin 1s linear infinite' }} />
                    <Typography className="dt-status-text">第 {store.currentLoop} 轮深度思考中</Typography>
                  </>
                )}
              </Box>
            )}

            {/* ── 配置正文 ── */}
            <Stack className="dt-panel-body" spacing={1.4}>

              <Typography className="dt-section-label">全能 Agent 功能配置 (AUTO模式)</Typography>

              <TextField
                label="Tavily API Key"
                  type="password"
                  placeholder="输入 Tavily API Key"
                  value={store.config.tavilyApiKey}
                  onChange={(e) => store.updateConfig({ tavilyApiKey: e.target.value })}
                fullWidth
                size="small"
              />
              <Typography sx={{ fontSize: 11, color: '#666' }}>
                Tavily 开关请在输入框下方工具栏中使用（位于“深度思考”按钮右侧）。
              </Typography>
              {!store.config.tavilyApiKey && store.config.tavilyEnabled && (
                <Alert severity="warning" sx={{ py: 0.2, '& .MuiAlert-message': { fontSize: 11 } }}>
                  已开启 Tavily，但未填写 API Key，联网搜索将失败。
                </Alert>
              )}

              <FormControlLabel
                control={(
                  <Switch
                    checked={store.config.localFolderEnabled}
                    onChange={(e) => store.updateConfig({ localFolderEnabled: e.target.checked })}
                  />
                )}
                label="文件夹读取开关"
              />
              {store.config.localFolderEnabled && (
                <Box sx={{ ml: 3, mt: 0.5 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      if (window.confirm("由于安全限制，需在插件的全页设置中进行文件夹授权。点击确定前往设置页面。")) {
                        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' }).catch(() => {
                          alert("跳转失败，请手动在扩展图标右键选择“选项”打开设置页。");
                        });
                      }
                    }}
                  >
                    前往授权工作区文件夹
                  </Button>
                  <Typography sx={{ fontSize: 11, color: '#666', mt: 0.6 }}>
                    授予本地读取权限以供Agent分析文件
                  </Typography>
                </Box>
              )}

              <Divider sx={{ my: 0.8 }} />
              <Typography className="dt-section-label" sx={{ mt: 0.6 }}>
                <Settings2 size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                循环设置
              </Typography>

              <TextField
                select
                label="循环思考使用的模型"
                value={store.config.loopModel}
                onChange={(e) => store.updateConfig({ loopModel: e.target.value as LoopModel })}
                size="small"
                fullWidth
              >
                <MenuItem value="fast">Flash (快速)</MenuItem>
                <MenuItem value="think">Think (思考)</MenuItem>
                <MenuItem value="pro">Pro (旗舰)</MenuItem>
              </TextField>

              <NumField
                label="最大思考轮次"
                value={store.config.maxLoops}
                min={1}
                onChange={(v) => store.updateConfig({ maxLoops: v })}
              />
              <NumField
                label="最少强制轮次"
                value={store.config.minLoops}
                min={1}
                onChange={(v) => store.updateConfig({ minLoops: v })}
              />
              <NumField
                label="轮次延迟（ms）"
                value={store.config.loopDelay}
                min={0}
                step={100}
                onChange={(v) => store.updateConfig({ loopDelay: v })}
              />

              <Divider sx={{ my: 0.8 }} />
              <Typography className="dt-section-label" sx={{ mt: 0.6 }}>
                <CheckCircle2 size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                审查视角
              </Typography>

              <TextField
                label="每行一个视角"
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
                系统提示词模板
              </Typography>

              <TextField
                multiline
                minRows={9}
                value={store.config.systemPromptTemplate}
                onChange={(e) => store.updateConfig({ systemPromptTemplate: e.target.value })}
                fullWidth
              />

              <Box sx={{ mt: 1.2, textAlign: 'center' }}>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={handleResetAll}
                >
                  重置所有设置与存储
                </Button>
              </Box>

            </Stack>
          </Box>
        )}
      </div>
    </ThemeProvider>
  );
});

export default Panel;
