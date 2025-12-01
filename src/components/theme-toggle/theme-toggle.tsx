import { useTheme } from '@/contexts/theme-context';
import { MoonIcon } from '@/static/moon-icon';
import { SunIcon } from '@/static/sun-icon';
import './theme-toggle.scss';

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    const switchToDarkModeText = 'Switch to dark mode';
    const switchToLightModeText = 'Switch to light mode';

    const label = theme === 'light' ? switchToDarkModeText : switchToLightModeText;

    return (
        <button className='theme-toggle btn btn-outline-secondary' onClick={toggleTheme} aria-label={label} title={label}>
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
    );
}
