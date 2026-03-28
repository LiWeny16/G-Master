import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './locales/zh.ts';
import en from './locales/en.ts';

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            zh: { translation: zh },
        },
        lng: (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('en')) ? 'en' : 'zh',
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // React 已经处理了 XSS
        },
    });

export default i18n;
