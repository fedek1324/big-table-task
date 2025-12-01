import 'i18next';
// import { TranslationTypes } from '@/i18n/translations/TranslationTypes';
import type en from '../i18n/translations/en_translation.json';
import type ru from '../i18n/translations/ru_translation.json';

declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: 'en';
        resources: {
            en: typeof en;
            ru: typeof ru;
        };
        returnNull: false;
        returnEmptyString: false;
    }
}
