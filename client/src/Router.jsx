import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Admin from './pages/Admin';
import CannedResponses from './pages/CannedResponses';
import PrivateNotes from './pages/PrivateNotes';
import ProtectedRoute from './components/ProtectedRoute';

const AppRouter = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route
            path="admin"
            element={<ProtectedRoute><Admin /></ProtectedRoute>}
          />
          <Route
            path="canned-responses"
            element={<ProtectedRoute><CannedResponses /></ProtectedRoute>}
          />
          <Route
            path="private-notes"
            element={<ProtectedRoute><PrivateNotes /></ProtectedRoute>}
          />
        </Route>
      </Routes>
    </Router>
  );
};

export default AppRouter;