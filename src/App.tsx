import { Navigate, Route, Routes } from 'react-router-dom';
import './App.scss';
import { Stats } from './features/stats/stats';
import './i18n/i18n';

function App() {
    return (
        <Routes>
            <Route path='/' element={<Navigate to='/stats' />} />
            <Route path='/stats' element={<Stats />} />
        </Routes>
    );
}

export default App;
