'use client';

import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
    const { i18n } = useTranslation();

    const changeLanguage = async (lang: 'en' | 'ru') => {
        await i18n.changeLanguage(lang);
    };

    return (
        <div className='space-x-2'>
            <button
                onClick={() => changeLanguage('en')}
                className='px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
            >
                EN
            </button>

            <button
                onClick={() => changeLanguage('ru')}
                className='px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
            >
                RU
            </button>
        </div>
    );
}
