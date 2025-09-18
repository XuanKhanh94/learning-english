import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, Profile } from '../lib/firebase';

type UserRole = 'admin' | 'teacher' | 'student';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check Firebase configuration
    if (!auth || !db) {
      console.error('🚫 Firebase not properly configured. Check environment variables.');
      setError('Firebase configuration missing. Please check your .env file.');
      setLoading(false);
      return;
    }

    // Listen to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      ('🔄 Auth state changed:', user ? `User: ${user.email}` : 'No user');
      setUser(user);

      if (user) {
        await fetchProfile(user.uid);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      ('📋 Fetching profile for user:', userId);
      const profileDoc = await getDoc(doc(db, 'profiles', userId));

      if (profileDoc.exists()) {
        const profileData = { id: profileDoc.id, ...profileDoc.data() } as Profile;
        ('✅ Profile found:', profileData);
        setProfile(profileData);
      } else {
        ('❌ Profile not found, creating default profile');
        await createDefaultProfile(userId);
      }
    } catch (error) {
      console.error('💥 Error fetching profile:', error);
      setProfile(null);
    }
  };

  const createDefaultProfile = async (userId: string) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // Determine role based on email
      let role: UserRole = 'student'; // default role
      if (user.email === 'xuankhanh379@gmail.com') {
        role = 'admin';
      }

      const defaultProfile: Omit<Profile, 'id'> = {
        email: user.email || '',
        full_name: user.displayName || user.email?.split('@')[0] || 'User',
        role: role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      ('🔧 Creating profile with role:', role, 'for email:', user.email);

      await setDoc(doc(db, 'profiles', userId), {
        ...defaultProfile,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      const profileWithId = { id: userId, ...defaultProfile };
      ('✅ Profile created successfully:', profileWithId);
      setProfile(profileWithId);
    } catch (error) {
      console.error('💥 Error creating default profile:', error);
      setProfile(null);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      ('🔐 Attempting sign-in with:', { email, password: '***' });

      const result = await signInWithEmailAndPassword(auth, email, password);
      ('✅ Sign-in successful:', result.user.email);

      return { user: result.user, error: null };
    } catch (error: any) {
      console.error('❌ Sign-in error:', error);

      let errorMessage = 'Đã xảy ra lỗi không mong muốn';

      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Email hoặc mật khẩu không đúng';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Email không hợp lệ';
          break;
        case 'auth/user-disabled':
          errorMessage = 'Tài khoản đã bị vô hiệu hóa';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Quá nhiều lần thử. Vui lòng thử lại sau';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối internet';
          break;
        default:
          errorMessage = error.message || 'Lỗi đăng nhập không xác định';
      }

      return { user: null, error: { message: errorMessage, code: error.code } };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      ('📝 Attempting sign-up with:', { email, fullName });

      const result = await createUserWithEmailAndPassword(auth, email, password);

      // Update display name
      await updateProfile(result.user, {
        displayName: fullName
      });

      ('✅ Sign-up successful:', result.user.email);

      return { user: result.user, error: null };
    } catch (error: any) {
      console.error('❌ Sign-up error:', error);

      let errorMessage = 'Đã xảy ra lỗi không mong muốn';

      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Email này đã được đăng ký. Vui lòng sử dụng email khác hoặc đăng nhập';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Email không hợp lệ';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Đăng ký email/mật khẩu chưa được kích hoạt';
          break;
        case 'auth/weak-password':
          errorMessage = 'Mật khẩu quá yếu. Vui lòng chọn mật khẩu mạnh hơn';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối internet';
          break;
        default:
          errorMessage = error.message || 'Lỗi đăng ký không xác định';
      }

      return { user: null, error: { message: errorMessage, code: error.code } };
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      ('✅ Sign-out successful');
      return { error: null };
    } catch (error: any) {
      console.error('❌ Sign-out error:', error);
      return { error: { message: 'Lỗi đăng xuất', code: error.code } };
    }
  };

  return {
    user,
    profile,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    fetchProfile,
  };
}