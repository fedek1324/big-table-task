import { useTranslation } from 'react-i18next';
import './language-switcher.scss';

export default function LanguageSwitcher() {
    const { i18n } = useTranslation();

    const onEnButtonHandle = async () => {
        await i18n.changeLanguage('en');
    };

    const onRuButtonHandle = async () => {
        await i18n.changeLanguage('ru');
    };

    const currentLanguage = i18n.language;

    return (
        <div className='language-switcher'>
            <button onClick={onEnButtonHandle} className={currentLanguage === 'en' ? 'button active' : 'button'}>
                EN
            </button>

            <button onClick={onRuButtonHandle} className={currentLanguage === 'ru' ? 'button active' : 'button'}>
                RU
            </button>
        </div>
    );
}
