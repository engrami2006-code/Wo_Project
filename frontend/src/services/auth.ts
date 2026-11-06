import { http } from './api';
import type { LoginRequest, Message, ProfileUpdate, RegisterRequest, TokenResponse, User } from '../types/api';

export const authService = {
  login: (data: LoginRequest) => http.post<TokenResponse>('/auth/login', data),
  register: (data: RegisterRequest) => http.post<TokenResponse>('/auth/register', data),
  logout: () => http.post<Message>('/auth/logout'),
  me: () => http.get<User>('/users/me'),
  updateMe: (data: ProfileUpdate) => http.patch<User>('/users/me', data),
};
