import 'i18next';
// import { TranslationTypes } from '@/i18n/translations/TranslationTypes';
import type common from '../i18n/translations/en_translation.json';
import type ru from '../i18n/translations/ru_translation.json';

declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: 'common';
        resources: {
            common: typeof common;
            ru: typeof ru;
        };
        returnNull: false;
        returnEmptyString: false;
    }
}
