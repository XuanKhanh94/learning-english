import React, { useState } from 'react';
import { LoginForm } from './LoginForm';
import { SignUpForm } from './SignUpForm';

export function AuthContainer() {
  const [isLogin, setIsLogin] = useState(true);

  const switchToSignUp = () => setIsLogin(false);
  const switchToLogin = () => setIsLogin(true);

  if (isLogin) {
    return <LoginForm onSwitchToSignUp={switchToSignUp} />;
  }

  return <SignUpForm onSwitchToLogin={switchToLogin} />;
}