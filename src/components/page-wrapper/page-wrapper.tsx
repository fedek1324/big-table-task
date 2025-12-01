import LanguageSwitcher from '../language-switcher/LanguageSwitcher';
import { PageHeader, PageHeaderProps } from '../page-header/page-header';
import './page-wrapper.scss';

interface Props extends React.PropsWithChildren<PageHeaderProps> {}

export function PageWrapper({ children, ...pageHeaderProps }: Props) {
    return (
        <div className='page-wrapper'>
            <LanguageSwitcher />
            <PageHeader {...pageHeaderProps} />
            <div className='page-wrapper-content'>{children}</div>
        </div>
    );
}
