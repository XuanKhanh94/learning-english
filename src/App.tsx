import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './lib/firebase';
import { useAuth } from './hooks/useAuth';
import { AuthContainer } from './components/Auth/AuthContainer';
import { Layout } from './components/Layout';
import { BookOpen, Users, FileText, TrendingUp } from 'lucide-react';

// Lazy load components for better performance
const UserManagement = React.lazy(() =>
  import('./components/Admin/UserManagement').then(module => ({
    default: module.UserManagement
  }))
);

const CreateAssignment = React.lazy(() =>
  import('./components/Teacher/CreateAssignment').then(module => ({
    default: module.CreateAssignment
  }))
);

const TeacherAssignments = React.lazy(() =>
  import('./components/Teacher/TeacherAssignments').then(module => ({
    default: module.TeacherAssignments
  }))
);

const StudentAssignments = React.lazy(() =>
  import('./components/Student/StudentAssignments').then(module => ({
    default: module.StudentAssignments
  }))
);

const StudentSubmissions = React.lazy(() =>
  import('./components/Student/StudentSubmissions').then(module => ({
    default: module.StudentSubmissions
  }))
);

const SubmissionManagement = React.lazy(() =>
  import('./components/Teacher/SubmissionManagement').then(module => ({
    default: module.SubmissionManagement
  }))
);

// Loading component
const LoadingSpinner = React.memo(() => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
));

function App() {
  const { user, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthContainer />;
  }

  const renderContent = () => {
    // Admin routes
    if (profile.role === 'admin') {
      switch (activeTab) {
        case 'users':
          return (
            <Suspense fallback={<LoadingSpinner />}>
              <UserManagement />
            </Suspense>
          );
        case 'assignments':
          return <div>Tất cả bài tập</div>;
        case 'settings':
          return <div>Cài đặt hệ thống</div>;
        default:
          return (
            <Suspense fallback={<LoadingSpinner />}>
              <UserManagement />
            </Suspense>
          );
      }
    }

    // Teacher routes
    if (profile.role === 'teacher') {
      switch (activeTab) {
        case 'assignments':
          return (
            <Suspense fallback={<LoadingSpinner />}>
              <TeacherAssignments />
            </Suspense>
          );
        case 'create-assignment':
          return (
            <Suspense fallback={<LoadingSpinner />}>
              <CreateAssignment />
            </Suspense>
          );
        case 'submissions':
          return (
            <Suspense fallback={<LoadingSpinner />}>
              <SubmissionManagement />
            </Suspense>
          );
        case 'pending-submissions':
          return (
            <Suspense fallback={<LoadingSpinner />}>
              <SubmissionManagement showOnlyPending={true} />
            </Suspense>
          );
        default:
          return <TeacherDashboard onTabChange={setActiveTab} />;
      }
    }

    // Student routes
    if (profile.role === 'student') {
      switch (activeTab) {
        case 'dashboard':
          return <StudentDashboard />;
        case 'assignments':
          return (
            <Suspense fallback={<LoadingSpinner />}>
              <StudentAssignments />
            </Suspense>
          );
        case 'submissions':
          return (
            <Suspense fallback={<LoadingSpinner />}>
              <StudentSubmissions />
            </Suspense>
          );
        default:
          return (
            <Suspense fallback={<LoadingSpinner />}>
              <StudentAssignments />
            </Suspense>
          );
      }
    }

    return <div>Không tìm thấy trang</div>;
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}

// Memoized dashboard components to prevent unnecessary re-renders
const TeacherDashboard = React.memo(function TeacherDashboard({
  onTabChange
}: {
  onTabChange?: (tab: string) => void
}) {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalAssignments: 0,
    totalStudents: 0,
    pendingSubmissions: 0
  });
  const [loading, setLoading] = useState(true);

  // Memoize the fetch function to prevent recreation on every render
  const fetchTeacherStats = useMemo(() => async () => {
    if (!profile) return;

    try {
      // Fetch assignments created by this teacher
      const assignmentsQuery = query(
        collection(db, 'assignments'),
        where('teacher_id', '==', profile.id)
      );
      const assignmentsSnapshot = await getDocs(assignmentsQuery);
      const totalAssignments = assignmentsSnapshot.docs.length;
      const teacherAssignmentIds = assignmentsSnapshot.docs.map(doc => doc.id);

      if (teacherAssignmentIds.length === 0) {
        setStats({ totalAssignments: 0, totalStudents: 0, pendingSubmissions: 0 });
        return;
      }

      // Optimize: Use Promise.all for parallel queries
      const [studentQueries, submissionQueries] = await Promise.all([
        // Get all assignment-student relationships
        Promise.all(
          teacherAssignmentIds.map(assignmentId =>
            getDocs(query(
              collection(db, 'assignment_students'),
              where('assignment_id', '==', assignmentId)
            ))
          )
        ),
        // Get all pending submissions
        Promise.all(
          teacherAssignmentIds.map(assignmentId =>
            getDocs(query(
              collection(db, 'submissions'),
              where('assignment_id', '==', assignmentId),
              where('status', '==', 'submitted')
            ))
          )
        )
      ]);

      // Count unique students
      const uniqueStudents = new Set<string>();
      studentQueries.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          uniqueStudents.add(doc.data().student_id);
        });
      });

      // Count pending submissions
      const pendingSubmissions = submissionQueries.reduce(
        (total, snapshot) => total + snapshot.docs.length,
        0
      );

      setStats({
        totalAssignments,
        totalStudents: uniqueStudents.size,
        pendingSubmissions
      });
    } catch (error) {
      console.error('Error fetching teacher stats:', error);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile) {
      fetchTeacherStats();
    }
  }, [profile, fetchTeacherStats]);

  const handlePendingClick = useMemo(() => () => {
    if (onTabChange) {
      onTabChange('pending-submissions');
    }
  }, [onTabChange]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bảng điều khiển Giáo viên</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Bài tập đã tạo</dt>
                <dd className="text-lg font-medium text-gray-900">{stats.totalAssignments}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Học sinh</dt>
                <dd className="text-lg font-medium text-gray-900">{stats.totalStudents}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div
          className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow"
          onClick={handlePendingClick}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BookOpen className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Chờ chấm</dt>
                <dd className="text-lg font-medium text-gray-900 flex items-center justify-between">
                  {stats.pendingSubmissions}
                  <span className="text-xs text-gray-400">Nhấn để xem</span>
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const StudentDashboard = React.memo(function StudentDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalAssignments: 0,
    submittedAssignments: 0,
    averageGrade: 0
  });
  const [loading, setLoading] = useState(true);

  // Memoize the fetch function
  const fetchStudentStats = useMemo(() => async () => {
    if (!profile) return;

    try {
      // Use Promise.all for parallel queries
      const [assignmentStudentsSnapshot, submissionsSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, 'assignment_students'),
          where('student_id', '==', profile.id)
        )),
        getDocs(query(
          collection(db, 'submissions'),
          where('student_id', '==', profile.id)
        ))
      ]);

      const totalAssignments = assignmentStudentsSnapshot.docs.length;
      const submissions = submissionsSnapshot.docs.map(doc => doc.data());
      const submittedAssignments = submissions.length;

      // Calculate average grade
      const gradedSubmissions = submissions.filter(sub =>
        sub.grade !== undefined && sub.grade !== null
      );
      const averageGrade = gradedSubmissions.length > 0
        ? gradedSubmissions.reduce((sum, sub) => sum + sub.grade, 0) / gradedSubmissions.length
        : 0;

      setStats({
        totalAssignments,
        submittedAssignments,
        averageGrade: Math.round(averageGrade * 10) / 10
      });
    } catch (error) {
      console.error('Error fetching student stats:', error);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile) {
      fetchStudentStats();
    }
  }, [profile, fetchStudentStats]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bảng điều khiển Học sinh</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Bài tập được giao</dt>
                <dd className="text-lg font-medium text-gray-900">{stats.totalAssignments}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BookOpen className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Đã nộp</dt>
                <dd className="text-lg font-medium text-gray-900">{stats.submittedAssignments}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Điểm trung bình</dt>
                <dd className="text-lg font-medium text-gray-900">
                  {stats.averageGrade > 0 ? stats.averageGrade : '--'}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default App;