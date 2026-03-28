import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Button,
    Chip,
    Collapse,
    Divider,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { HelpCircle, Send, SkipForward, Pencil } from 'lucide-react';
import { StateStore } from '../stores/state-store';
import { ClarifyQuestion } from '../types';

interface Props {
    store: StateStore;
    onSubmit: (answers: string[]) => void;
    onSkip: () => void;
}

const CLARIFY_THEME = createTheme({
    palette: {
        mode: 'light',
        primary: { main: '#8B7355' },
        secondary: { main: '#6B8B6B' },
        background: { default: '#FAFAF8' },
    },
    typography: {
        fontFamily: "'Segoe UI', 'Inter', Roboto, sans-serif",
        fontSize: 13,
    },
    shape: { borderRadius: 10 },
});

/** 单个问题卡片 */
const QuestionCard: React.FC<{
    index: number;
    question: ClarifyQuestion;
    answer: string;
    onChange: (val: string) => void;
}> = ({ index, question, answer, onChange }) => {
    const { t } = useTranslation();
    const [showCustom, setShowCustom] = useState(false);

    const isOption0 = !showCustom && answer === question.options[0];
    const isOption1 = !showCustom && answer === question.options[1];

    const handleChipClick = (opt: string) => {
        setShowCustom(false);
        onChange(opt);
    };

    const handleCustomClick = () => {
        setShowCustom(true);
        // Clear if was previously a preset option
        if (answer === question.options[0] || answer === question.options[1]) {
            onChange('');
        }
    };

    return (
        <Box
            sx={{
                background: 'linear-gradient(135deg, #FAFAF8 0%, #F5F0E8 100%)',
                border: '1px solid rgba(139,115,85,0.18)',
                borderRadius: '14px',
                p: 2,
                transition: 'box-shadow 0.2s',
                boxShadow: answer ? '0 4px 16px rgba(139,115,85,0.10)' : '0 1px 4px rgba(0,0,0,0.04)',
            }}
        >
            {/* Question header */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.2, mb: 1.5 }}>
                <Box
                    sx={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: answer ? '#8B7355' : 'rgba(139,115,85,0.12)',
                        color: answer ? '#fff' : '#8B7355',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                        transition: 'background 0.2s, color 0.2s',
                    }}
                >
                    {index + 1}
                </Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.4 }}>
                    {question.question}
                </Typography>
            </Box>

            {/* Option chips */}
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: showCustom ? 1.5 : 0 }}>
                <Chip
                    label={question.options[0]}
                    onClick={() => handleChipClick(question.options[0])}
                    variant={isOption0 ? 'filled' : 'outlined'}
                    size="small"
                    sx={{
                        fontWeight: isOption0 ? 700 : 500,
                        borderColor: isOption0 ? '#8B7355' : 'rgba(139,115,85,0.3)',
                        bgcolor: isOption0 ? '#8B7355' : 'transparent',
                        color: isOption0 ? '#fff' : '#5a4a35',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: isOption0 ? '#7a6347' : 'rgba(139,115,85,0.07)' },
                        transition: 'all 0.15s',
                    }}
                />
                <Chip
                    label={question.options[1]}
                    onClick={() => handleChipClick(question.options[1])}
                    variant={isOption1 ? 'filled' : 'outlined'}
                    size="small"
                    sx={{
                        fontWeight: isOption1 ? 700 : 500,
                        borderColor: isOption1 ? '#8B7355' : 'rgba(139,115,85,0.3)',
                        bgcolor: isOption1 ? '#8B7355' : 'transparent',
                        color: isOption1 ? '#fff' : '#5a4a35',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: isOption1 ? '#7a6347' : 'rgba(139,115,85,0.07)' },
                        transition: 'all 0.15s',
                    }}
                />
                <Chip
                    icon={<Pencil size={12} />}
                    label={t('clarify_option_custom')}
                    onClick={handleCustomClick}
                    variant={showCustom ? 'filled' : 'outlined'}
                    size="small"
                    sx={{
                        fontWeight: showCustom ? 700 : 500,
                        borderColor: showCustom ? '#6B8B6B' : 'rgba(107,139,107,0.3)',
                        bgcolor: showCustom ? '#6B8B6B' : 'transparent',
                        color: showCustom ? '#fff' : '#4a6a4a',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: showCustom ? '#5a7a5a' : 'rgba(107,139,107,0.07)' },
                        transition: 'all 0.15s',
                        '& .MuiChip-icon': { color: 'inherit' },
                    }}
                />
            </Stack>

            {/* Custom text input */}
            <Collapse in={showCustom}>
                <TextField
                    fullWidth
                    size="small"
                    autoFocus
                    placeholder={t('clarify_custom_placeholder')}
                    value={showCustom ? answer : ''}
                    onChange={(e) => onChange(e.target.value)}
                    variant="outlined"
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            fontSize: 13,
                            borderRadius: '10px',
                            bgcolor: '#fff',
                            '& fieldset': { borderColor: 'rgba(107,139,107,0.35)' },
                            '&:hover fieldset': { borderColor: '#6B8B6B' },
                            '&.Mui-focused fieldset': { borderColor: '#6B8B6B', borderWidth: 2 },
                        },
                    }}
                />
            </Collapse>
        </Box>
    );
};

const ClarifyModal: React.FC<Props> = observer(({ store, onSubmit, onSkip }) => {
    const { t } = useTranslation();
    const questions = store.clarifyQuestions;
    const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));

    if (store.userWorkflowPhase !== 'clarify' || questions.length === 0) return null;

    const answered = answers.filter(Boolean).length;
    const canSubmit = answered > 0;

    const handleAnswerChange = (i: number, val: string) => {
        setAnswers((prev) => {
            const next = [...prev];
            next[i] = val;
            return next;
        });
    };

    const handleSubmit = () => {
        onSubmit(answers);
    };

    return (
        <ThemeProvider theme={CLARIFY_THEME}>
            {/* Overlay */}
            <Box
                id="dt-clarify-overlay"
                sx={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 2147483646,
                    background: 'rgba(26,26,26,0.45)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: 'dtFadeIn 0.2s ease',
                }}
                onClick={(e) => {
                    if (e.target === e.currentTarget) onSkip();
                }}
            >
                {/* Modal card */}
                <Box
                    id="dt-clarify-modal"
                    sx={{
                        width: 460,
                        maxWidth: 'calc(100vw - 32px)',
                        maxHeight: '85vh',
                        background: '#FAFAF8',
                        borderRadius: '18px',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.28), 0 0 0 1px rgba(212,201,184,0.5)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        animation: 'dtFadeIn 0.22s cubic-bezier(0.4,0,0.2,1)',
                    }}
                >
                    {/* Header */}
                    <Box
                        sx={{
                            background: 'linear-gradient(135deg, #2d2d2d 0%, #3d3028 100%)',
                            px: 2.5, py: 2,
                            display: 'flex', alignItems: 'center', gap: 1.5,
                            flexShrink: 0,
                        }}
                    >
                        <Box
                            sx={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'rgba(139,115,85,0.25)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <HelpCircle size={18} color="#D4C9B8" />
                        </Box>
                        <Box>
                            <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#F5F0E8', lineHeight: 1.3 }}>
                                {t('clarify_title')}
                            </Typography>
                            <Typography sx={{ fontSize: 11.5, color: 'rgba(212,201,184,0.7)', mt: 0.3, lineHeight: 1.4 }}>
                                {t('clarify_subtitle')}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Progress bar */}
                    <Box sx={{ height: 3, background: '#EDE8DC', flexShrink: 0 }}>
                        <Box
                            sx={{
                                height: '100%',
                                width: `${(answered / questions.length) * 100}%`,
                                background: 'linear-gradient(90deg, #8B7355, #6B8B6B)',
                                transition: 'width 0.35s ease',
                            }}
                        />
                    </Box>

                    {/* Questions */}
                    <Box
                        sx={{
                            overflowY: 'auto', flex: 1, p: 2.5,
                            '&::-webkit-scrollbar': { width: 4 },
                            '&::-webkit-scrollbar-thumb': { background: '#D4C9B8', borderRadius: 2 },
                        }}
                    >
                        <Stack spacing={2}>
                            {questions.map((q, i) => (
                                <QuestionCard
                                    key={i}
                                    index={i}
                                    question={q}
                                    answer={answers[i] ?? ''}
                                    onChange={(val) => handleAnswerChange(i, val)}
                                />
                            ))}
                        </Stack>
                    </Box>

                    {/* Footer actions */}
                    <Box sx={{ flexShrink: 0 }}>
                        <Divider sx={{ borderColor: 'rgba(212,201,184,0.4)' }} />
                        <Box
                            sx={{
                                px: 2.5, py: 1.8,
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 1.5,
                                background: '#F5F0E8',
                            }}
                        >
                            {/* Answered counter */}
                            <Typography sx={{ fontSize: 11.5, color: 'rgba(45,45,45,0.5)', flexShrink: 0 }}>
                                {answered}/{questions.length} {store.config.language === 'en' ? 'answered' : '已回答'}
                            </Typography>

                            <Box sx={{ display: 'flex', gap: 1 }}>
                                {/* Skip button */}
                                <Button
                                    variant="text"
                                    size="small"
                                    startIcon={<SkipForward size={14} />}
                                    onClick={onSkip}
                                    sx={{
                                        color: 'rgba(45,45,45,0.5)',
                                        fontSize: 12,
                                        px: 1.5,
                                        '&:hover': { color: '#333', bgcolor: 'rgba(0,0,0,0.04)' },
                                    }}
                                >
                                    {t('clarify_skip')}
                                </Button>

                                {/* Submit button */}
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<Send size={14} />}
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    sx={{
                                        background: canSubmit
                                            ? 'linear-gradient(135deg, #8B7355, #6B8B6B)'
                                            : undefined,
                                        fontSize: 12,
                                        px: 2,
                                        boxShadow: canSubmit ? '0 2px 8px rgba(139,115,85,0.35)' : 'none',
                                        '&:hover': {
                                            background: 'linear-gradient(135deg, #7a6347, #5a7a5a)',
                                        },
                                        '&:disabled': { opacity: 0.5 },
                                    }}
                                >
                                    {t('clarify_submit')}
                                </Button>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
});

export default ClarifyModal;
