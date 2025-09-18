import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug logging
('Supabase URL:', supabaseUrl);
('Supabase Anon Key:', supabaseAnonKey ? 'Present' : 'Missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables. Please check your .env file.');
  console.error('Required variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  console.error('Current values:', {
    VITE_SUPABASE_URL: supabaseUrl || 'MISSING',
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? 'Present' : 'MISSING'
  });
}

// Only create client if we have valid credentials
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  })
  : null;

export type UserRole = 'admin' | 'teacher' | 'student';
export type AssignmentStatus = 'pending' | 'submitted' | 'graded';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
  last_notification_read_at?: string;
}

export interface Assignment {
  id: string;
  title: string;
  description?: string;
  file_url?: string;
  file_name?: string;
  teacher_id: string;
  created_at: string;
  due_date?: string;
  teacher?: Profile;
}

export interface AssignmentStudent {
  id: string;
  assignment_id: string;
  student_id: string;
  assigned_at: string;
  assignment?: Assignment;
  student?: Profile;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  file_url: string;
  file_name: string;
  status: AssignmentStatus;
  grade?: number;
  feedback?: string;
  submitted_at: string;
  graded_at?: string;
  assignment?: Assignment;
  student?: Profile;
}

export interface Comment {
  id: string;
  submission_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: Profile;
}