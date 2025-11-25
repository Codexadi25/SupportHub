import React from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { user } = useOutletContext();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;