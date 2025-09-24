import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Debug logging
('Firebase Config:', {
  apiKey: firebaseConfig.apiKey ? 'Present' : 'Missing',
  authDomain: firebaseConfig.authDomain ? 'Present' : 'Missing',
  projectId: firebaseConfig.projectId ? 'Present' : 'Missing',
  storageBucket: firebaseConfig.storageBucket ? 'Present' : 'Missing',
  messagingSenderId: firebaseConfig.messagingSenderId ? 'Present' : 'Missing',
  appId: firebaseConfig.appId ? 'Present' : 'Missing',
});

// Check if all required config values are present
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);

if (missingFields.length > 0) {
  console.error('❌ Missing Firebase configuration fields:', missingFields);
  console.error('Please check your .env file and ensure all VITE_FIREBASE_* variables are set');
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Configure storage settings to handle larger files and network issues
storage.maxUploadRetryTime = 1800000; // 30 minutes
storage.maxOperationRetryTime = 1800000; // 30 minutes

// Connect to emulators in development (optional)
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    ('🔧 Connected to Firebase emulators');
  } catch (error) {
    ('Firebase emulators not available or already connected');
  }
}

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

export interface Comment {
  id: string;
  submission_id: string;
  user_id: string;
  content: string;
  created_at: unknown;
  user?: Profile | null;
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