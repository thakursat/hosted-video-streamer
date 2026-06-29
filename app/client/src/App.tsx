import { Routes, Route, Navigate } from 'react-router-dom';
import { Library } from './pages/Library';
import { Login } from './pages/Login';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
