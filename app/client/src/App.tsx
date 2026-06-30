import { Routes, Route, Navigate } from 'react-router-dom';
import { Library } from './pages/Library';
import { Login } from './pages/Login';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/login" element={<Login />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
