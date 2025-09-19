import React from 'react';
import { useState, useEffect, useRef } from 'react';
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

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [notifications, setNotifications] = useState<Comment[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadTime, setLastReadTime] = useState<Date | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

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
    if (profile) {
      const savedLastReadTime = profile.last_notification_read_at;
      if (savedLastReadTime) {
        setLastReadTime(new Date(savedLastReadTime));
      }
    }
  }, [profile]);
  // Listen for new comments
  useEffect(() => {
    if (!profile) return;

    let unsubscribe: (() => void) | undefined;

    const setupCommentListener = async () => {
      try {

        if (profile.role === 'student') {
          // For students: listen to comments on their submissions
          const submissionsQuery = query(
            collection(db, 'submissions'),
            where('student_id', '==', profile.id)
          );

          // Get submission IDs first
          const submissionsSnapshot = await getDocs(submissionsQuery);
          const submissionIds = submissionsSnapshot.docs.map(doc => doc.id);

          if (submissionIds.length > 0) {
            // Process submissions in batches of 10 (Firestore 'in' limit)
            const batches = [];
            for (let i = 0; i < submissionIds.length; i += 10) {
              batches.push(submissionIds.slice(i, i + 10));
            }

            // Set up listeners for all batches
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

                    // Skip own comments
                    if (commentData.user_id === profile.id) return null;

                    // Fetch user details
                    const userDoc = await getDoc(doc(db, 'profiles', commentData.user_id));
                    const user = userDoc.exists() ?
                      { id: userDoc.id, ...userDoc.data() } as Profile :
                      null;

                    return { ...commentData, user };
                  })
                );

                const validComments = comments.filter(c => c !== null) as Comment[];

                // Merge with existing notifications from other batches
                setNotifications(prevNotifications => {
                  // Remove old comments from this batch and add new ones
                  const otherComments = prevNotifications.filter(notif =>
                    !batch.includes(notif.submission_id)
                  );
                  const allComments = [...otherComments, ...validComments];

                  // Sort by newest first and limit to 10
                  allComments.sort((a, b) => {
                    const dateA = a.created_at?.seconds ? new Date(a.created_at.seconds * 1000) : new Date(a.created_at);
                    const dateB = b.created_at?.seconds ? new Date(b.created_at.seconds * 1000) : new Date(b.created_at);
                    return dateB.getTime() - dateA.getTime();
                  });

                  const finalComments = allComments.slice(0, 10);

                  // Count unread notifications (after last read time)
                  if (lastReadTime) {
                    const unreadComments = finalComments.filter(comment => {
                      const commentDate = comment.created_at?.seconds
                        ? new Date(comment.created_at.seconds * 1000)
                        : new Date(comment.created_at);
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

            // Return cleanup function for all listeners
            unsubscribe = () => {
              unsubscribes.forEach(unsub => unsub());
            };
          }
        } else if (profile.role === 'teacher') {
          // For teachers: listen to comments on submissions for their assignments
          const assignmentsQuery = query(
            collection(db, 'assignments'),
            where('teacher_id', '==', profile.id)
          );

          const assignmentsSnapshot = await getDocs(assignmentsQuery);
          const assignmentIds = assignmentsSnapshot.docs.map(doc => doc.id);

          if (assignmentIds.length > 0) {
            // Get submissions for teacher's assignments
            const allSubmissionIds: string[] = [];
            for (const assignmentId of assignmentIds) {
              const submissionsQuery = query(
                collection(db, 'submissions'),
                where('assignment_id', '==', assignmentId)
              );
              const submissionsSnapshot = await getDocs(submissionsQuery);
              allSubmissionIds.push(...submissionsSnapshot.docs.map(doc => doc.id));
            }

            if (allSubmissionIds.length > 0) {
              // Process submissions in batches of 10 (Firestore 'in' limit)
              const batches = [];
              for (let i = 0; i < allSubmissionIds.length; i += 10) {
                batches.push(allSubmissionIds.slice(i, i + 10));
              }

              // Set up listeners for all batches
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

                      // Skip own comments
                      if (commentData.user_id === profile.id) return null;

                      // Fetch user details
                      const userDoc = await getDoc(doc(db, 'profiles', commentData.user_id));
                      const user = userDoc.exists() ?
                        { id: userDoc.id, ...userDoc.data() } as Profile :
                        null;

                      return { ...commentData, user };
                    })
                  );

                  const validComments = comments.filter(c => c !== null) as Comment[];

                  // Merge with existing notifications from other batches
                  setNotifications(prevNotifications => {
                    // Remove old comments from this batch and add new ones
                    const otherComments = prevNotifications.filter(notif =>
                      !batch.includes(notif.submission_id)
                    );
                    const allComments = [...otherComments, ...validComments];

                    // Sort by newest first and limit to 10
                    allComments.sort((a, b) => {
                      const dateA = a.created_at?.seconds ? new Date(a.created_at.seconds * 1000) : new Date(a.created_at);
                      const dateB = b.created_at?.seconds ? new Date(b.created_at.seconds * 1000) : new Date(b.created_at);
                      return dateB.getTime() - dateA.getTime();
                    });

                    const finalComments = allComments.slice(0, 10);

                    // Count unread notifications (after last read time)
                    let newUnreadCount = 0;
                    if (lastReadTime) {
                      const unreadComments = finalComments.filter(comment => {
                        const commentDate = comment.created_at?.seconds
                          ? new Date(comment.created_at.seconds * 1000)
                          : new Date(comment.created_at);
                        return commentDate > lastReadTime;
                      });
                      newUnreadCount = unreadComments.length;
                    } else {
                      newUnreadCount = finalComments.length;
                    }

                    // Update unread count outside of setNotifications
                    setTimeout(() => setUnreadCount(newUnreadCount), 0);

                    // Update unread count outside of setNotifications
                    setTimeout(() => setUnreadCount(newUnreadCount), 0);

                    return finalComments;
                  });
                });

                unsubscribes.push(batchUnsubscribe);
              }

              // Return cleanup function for all listeners
              unsubscribe = () => {
                unsubscribes.forEach(unsub => unsub());
              };
            }
          }
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
  }, [profile, lastReadTime]);

  const markAllAsRead = async () => {
    if (!profile) return;

    const now = new Date();

    try {
      // Update profile with last read time
      await updateDoc(doc(db, 'profiles', profile.id), {
        last_notification_read_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setLastReadTime(now);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error updating last read time:', error);
    }
    setShowNotifications(false);
  };

  const getMenuItems = () => {
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
          { id: 'assignments', label: 'Bài tập của tôi', icon: FileText },
          { id: 'submissions', label: 'Bài đã nộp', icon: Upload },
        ];
      default:
        return [];
    }
  };

  const menuItems = getMenuItems();

  const handleSignOut = async () => {
    await signOut();
  };

  const getRoleLabel = () => {
    switch (profile?.role) {
      case 'admin': return 'Quản trị viên';
      case 'teacher': return 'Giáo viên';
      case 'student': return 'Học sinh';
      default: return '';
    }
  };

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
                onClick={() => setShowNotifications(!showNotifications)}
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
                        <div key={notification.id} className="p-3 border-b last:border-b-0 hover:bg-gray-50">
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
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="w-3 h-3 text-gray-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">{profile?.full_name}</p>
                  <p className="text-xs text-gray-500">{getRoleLabel()}</p>
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
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${activeTab === item.id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

      </div>
    </div>
  );
}