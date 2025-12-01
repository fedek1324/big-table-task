import LanguageSwitcher from '../language-switcher/language-switcher';
import { PageHeader, PageHeaderProps } from '../page-header/page-header';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import './page-wrapper.scss';

interface Props extends React.PropsWithChildren<PageHeaderProps> {}

export function PageWrapper({ children, ...pageHeaderProps }: Props) {
    return (
        <div className='page-wrapper'>
            <div className='page-wrapper-controls'>
                <LanguageSwitcher />
                <ThemeToggle />
            </div>
            <PageHeader {...pageHeaderProps} />
            <div className='page-wrapper-content'>{children}</div>
        </div>
    );
}
