import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, Comment, Profile } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import {
  BookOpen,
  Users,
  FileText,
  Upload,
  Download,
  Settings,
  LogOut,
  User,
  Bell,
  ChevronDown,
  Check
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// Memoized notification item component
const NotificationItem = React.memo(({ notification }: { notification: Comment }) => (
  <div className="p-3 border-b last:border-b-0 hover:bg-gray-50">
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
        <User className="w-3 h-3 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {notification.user?.full_name || 'Unknown User'}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {notification.content}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {notification.created_at?.seconds
            ? new Date(notification.created_at.seconds * 1000).toLocaleString('vi-VN')
            : 'Vừa xong'
          }
        </p>
      </div>
    </div>
  </div>
));

NotificationItem.displayName = 'NotificationItem';

// Memoized menu item component
const MenuItem = React.memo(({
  item,
  isActive,
  onClick
}: {
  item: { id: string; label: string; icon: any },
  isActive: boolean,
  onClick: () => void
}) => {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${isActive
          ? 'bg-blue-50 text-blue-600'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
    >
      <Icon className="w-5 h-5" />
      {item.label}
    </button>
  );
});

MenuItem.displayName = 'MenuItem';

export const Layout = React.memo(function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [notifications, setNotifications] = useState<Comment[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadTime, setLastReadTime] = useState<Date | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Memoize menu items to prevent recalculation
  const menuItems = useMemo(() => {
    if (!profile) return [];

    switch (profile.role) {
      case 'admin':
        return [
          { id: 'users', label: 'Quản lý người dùng', icon: Users },
          { id: 'settings', label: 'Cài đặt', icon: Settings },
        ];
      case 'teacher':
        return [
          { id: 'dashboard', label: 'Tổng quan', icon: BookOpen },
          { id: 'assignments', label: 'Bài tập của tôi', icon: FileText },
          { id: 'create-assignment', label: 'Tạo bài tập', icon: Upload },
          { id: 'submissions', label: 'Bài nộp', icon: Download },
        ];
      case 'student':
        return [
          { id: 'dashboard', label: 'Tổng quan', icon: BookOpen },
          { id: 'assignments', label: 'Bài tập của tôi', icon: FileText },
          { id: 'submissions', label: 'Bài đã nộp', icon: Upload },
        ];
      default:
        return [];
    }
  }, [profile?.role]);

  // Memoize role label
  const roleLabel = useMemo(() => {
    switch (profile?.role) {
      case 'admin': return 'Quản trị viên';
      case 'teacher': return 'Giáo viên';
      case 'student': return 'Học sinh';
      default: return '';
    }
  }, [profile?.role]);

  // Memoize callbacks to prevent unnecessary re-renders
  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const handleTabChange = useCallback((tabId: string) => {
    onTabChange(tabId);
  }, [onTabChange]);

  const toggleNotifications = useCallback(() => {
    setShowNotifications(prev => !prev);
  }, []);

  const toggleDropdown = useCallback(() => {
    setShowDropdown(prev => !prev);
  }, []);

  // Optimized comment date parsing
  const parseCommentDate = useCallback((timestamp: any): Date => {
    if (timestamp?.seconds) {
      return new Date(timestamp.seconds * 1000);
    }
    return new Date(timestamp);
  }, []);

  // Optimized batch processing function
  const createBatches = useCallback((items: string[], batchSize = 10): string[][] => {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load last read time from profile
  useEffect(() => {
    if (profile?.last_notification_read_at) {
      setLastReadTime(new Date(profile.last_notification_read_at));
    }
  }, [profile?.last_notification_read_at]);

  // Optimized comment listener setup
  useEffect(() => {
    if (!profile) return;

    let unsubscribe: (() => void) | undefined;

    const setupCommentListener = async () => {
      try {
        if (profile.role === 'student') {
          // For students: listen to comments on their submissions
          const submissionsSnapshot = await getDocs(
            query(collection(db, 'submissions'), where('student_id', '==', profile.id))
          );

          const submissionIds = submissionsSnapshot.docs.map(doc => doc.id);
          if (submissionIds.length === 0) return;

          const batches = createBatches(submissionIds);
          const unsubscribes: (() => void)[] = [];

          for (const batch of batches) {
            const commentsQuery = query(
              collection(db, 'comments'),
              where('submission_id', 'in', batch)
            );

            const batchUnsubscribe = onSnapshot(commentsQuery, async (snapshot) => {
              // Use Promise.all for parallel processing
              const comments = await Promise.all(
                snapshot.docs.map(async (commentDoc) => {
                  const commentData = { id: commentDoc.id, ...commentDoc.data() } as Comment;

                  // Skip own comments
                  if (commentData.user_id === profile.id) return null;

                  // Fetch user details with error handling
                  try {
                    const userDoc = await getDoc(doc(db, 'profiles', commentData.user_id));
                    const user = userDoc.exists()
                      ? { id: userDoc.id, ...userDoc.data() } as Profile
                      : null;
                    return { ...commentData, user };
                  } catch (error) {
                    console.error('Error fetching user:', error);
                    return { ...commentData, user: null };
                  }
                })
              );

              const validComments = comments.filter(Boolean) as Comment[];

              setNotifications(prevNotifications => {
                // Optimize notification merging
                const otherComments = prevNotifications.filter(notif =>
                  !batch.includes(notif.submission_id)
                );
                const allComments = [...otherComments, ...validComments];

                // Sort and limit
                allComments.sort((a, b) => {
                  const dateA = parseCommentDate(a.created_at);
                  const dateB = parseCommentDate(b.created_at);
                  return dateB.getTime() - dateA.getTime();
                });

                const finalComments = allComments.slice(0, 10);

                // Update unread count
                if (lastReadTime) {
                  const unreadComments = finalComments.filter(comment => {
                    const commentDate = parseCommentDate(comment.created_at);
                    return commentDate > lastReadTime;
                  });
                  setUnreadCount(unreadComments.length);
                } else {
                  setUnreadCount(finalComments.length);
                }

                return finalComments;
              });
            });

            unsubscribes.push(batchUnsubscribe);
          }

          unsubscribe = () => unsubscribes.forEach(unsub => unsub());

        } else if (profile.role === 'teacher') {
          // For teachers: optimized query structure
          const [assignmentsSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'assignments'), where('teacher_id', '==', profile.id)))
          ]);

          const assignmentIds = assignmentsSnapshot.docs.map(doc => doc.id);
          if (assignmentIds.length === 0) return;

          // Get all submissions in parallel
          const submissionQueries = assignmentIds.map(assignmentId =>
            getDocs(query(collection(db, 'submissions'), where('assignment_id', '==', assignmentId)))
          );

          const submissionSnapshots = await Promise.all(submissionQueries);
          const allSubmissionIds = submissionSnapshots.flatMap(snapshot =>
            snapshot.docs.map(doc => doc.id)
          );

          if (allSubmissionIds.length === 0) return;

          const batches = createBatches(allSubmissionIds);
          const unsubscribes: (() => void)[] = [];

          for (const batch of batches) {
            const commentsQuery = query(
              collection(db, 'comments'),
              where('submission_id', 'in', batch)
            );

            const batchUnsubscribe = onSnapshot(commentsQuery, async (snapshot) => {
              const comments = await Promise.all(
                snapshot.docs.map(async (commentDoc) => {
                  const commentData = { id: commentDoc.id, ...commentDoc.data() } as Comment;

                  if (commentData.user_id === profile.id) return null;

                  try {
                    const userDoc = await getDoc(doc(db, 'profiles', commentData.user_id));
                    const user = userDoc.exists()
                      ? { id: userDoc.id, ...userDoc.data() } as Profile
                      : null;
                    return { ...commentData, user };
                  } catch (error) {
                    console.error('Error fetching user:', error);
                    return { ...commentData, user: null };
                  }
                })
              );

              const validComments = comments.filter(Boolean) as Comment[];

              setNotifications(prevNotifications => {
                const otherComments = prevNotifications.filter(notif =>
                  !batch.includes(notif.submission_id)
                );
                const allComments = [...otherComments, ...validComments];

                allComments.sort((a, b) => {
                  const dateA = parseCommentDate(a.created_at);
                  const dateB = parseCommentDate(b.created_at);
                  return dateB.getTime() - dateA.getTime();
                });

                const finalComments = allComments.slice(0, 10);

                // Use requestAnimationFrame for better performance
                requestAnimationFrame(() => {
                  if (lastReadTime) {
                    const unreadComments = finalComments.filter(comment => {
                      const commentDate = parseCommentDate(comment.created_at);
                      return commentDate > lastReadTime;
                    });
                    setUnreadCount(unreadComments.length);
                  } else {
                    setUnreadCount(finalComments.length);
                  }
                });

                return finalComments;
              });
            });

            unsubscribes.push(batchUnsubscribe);
          }

          unsubscribe = () => unsubscribes.forEach(unsub => unsub());
        }
      } catch (error) {
        console.error('Error setting up comment listener:', error);
      }
    };

    setupCommentListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [profile?.id, profile?.role, lastReadTime, createBatches, parseCommentDate]);

  const markAllAsRead = useCallback(async () => {
    if (!profile) return;

    try {
      await updateDoc(doc(db, 'profiles', profile.id), {
        last_notification_read_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setLastReadTime(new Date());
      setUnreadCount(0);
      setShowNotifications(false);
    } catch (error) {
      console.error('Error updating last read time:', error);
    }
  }, [profile?.id]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Học và học</h1>
              <p className="text-sm text-gray-500">Học trực tuyến</p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={toggleNotifications}
                className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
                  <div className="p-3 border-b flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">Thông báo mới</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        Không có thông báo mới
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <NotificationItem key={notification.id} notification={notification} />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={toggleDropdown}
                className="flex items-center gap-2 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="w-3 h-3 text-gray-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">{profile?.full_name}</p>
                  <p className="text-xs text-gray-500">{roleLabel}</p>
                </div>
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* User Dropdown Menu */}
              {showDropdown && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-50">
                  <div className="p-2">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Menu */}
        <nav className="p-4">
          {menuItems.map((item) => (
            <MenuItem
              key={item.id}
              item={item}
              isActive={activeTab === item.id}
              onClick={() => handleTabChange(item.id)}
            />
          ))}
        </nav>
      </div>
    </div>
  );
});