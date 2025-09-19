import React, { useState } from 'react';
import { useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './lib/firebase';
import { useAuth } from './hooks/useAuth';
import { AuthContainer } from './components/Auth/AuthContainer';
import { Layout } from './components/Layout';
import { UserManagement } from './components/Admin/UserManagement';
import { CreateAssignment } from './components/Teacher/CreateAssignment';
import { TeacherAssignments } from './components/Teacher/TeacherAssignments';
import { StudentAssignments } from './components/Student/StudentAssignments';
import { StudentSubmissions } from './components/Student/StudentSubmissions';
import { SubmissionManagement } from './components/Teacher/SubmissionManagement';
import { BookOpen, Users, FileText, TrendingUp } from 'lucide-react';

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
          return <UserManagement />;
        case 'assignments':
          return <div>Tất cả bài tập</div>;
        case 'settings':
          return <div>Cài đặt hệ thống</div>;
        default:
          return <UserManagement />;
      }
    }

    // Teacher routes
    if (profile.role === 'teacher') {
      switch (activeTab) {
        case 'assignments':
          return <TeacherAssignments />;
        case 'create-assignment':
          return <CreateAssignment />;
        case 'submissions':
          return <SubmissionManagement />;
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
          return <StudentAssignments />;
        case 'submissions':
          return <StudentSubmissions />;
        default:
          return <StudentAssignments />;
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

function TeacherDashboard({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalAssignments: 0,
    totalStudents: 0,
    pendingSubmissions: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchTeacherStats();
    }
  }, [profile]);

  const fetchTeacherStats = async () => {
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

      // Count unique students assigned to teacher's assignments
      const uniqueStudents = new Set<string>();
      for (const assignmentId of teacherAssignmentIds) {
        const assignmentStudentsQuery = query(
          collection(db, 'assignment_students'),
          where('assignment_id', '==', assignmentId)
        );
        const assignmentStudentsSnapshot = await getDocs(assignmentStudentsQuery);
        assignmentStudentsSnapshot.docs.forEach(doc => {
          uniqueStudents.add(doc.data().student_id);
        });
      }

      // Count pending submissions (status = 'submitted')
      let pendingSubmissions = 0;
      for (const assignmentId of teacherAssignmentIds) {
        const submissionsQuery = query(
          collection(db, 'submissions'),
          where('assignment_id', '==', assignmentId),
          where('status', '==', 'submitted')
        );
        const submissionsSnapshot = await getDocs(submissionsQuery);
        pendingSubmissions += submissionsSnapshot.docs.length;
      }

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
  };

  const handlePendingClick = () => {
    if (onTabChange) {
      onTabChange('pending-submissions');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
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
}

function StudentDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalAssignments: 0,
    submittedAssignments: 0,
    averageGrade: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchStudentStats();
    }
  }, [profile]);

  const fetchStudentStats = async () => {
    if (!profile) return;

    try {
      // Fetch assignments assigned to this student
      const assignmentStudentsQuery = query(
        collection(db, 'assignment_students'),
        where('student_id', '==', profile.id)
      );
      const assignmentStudentsSnapshot = await getDocs(assignmentStudentsQuery);
      const totalAssignments = assignmentStudentsSnapshot.docs.length;

      // Fetch submissions by this student
      const submissionsQuery = query(
        collection(db, 'submissions'),
        where('student_id', '==', profile.id)
      );
      const submissionsSnapshot = await getDocs(submissionsQuery);
      const submissions = submissionsSnapshot.docs.map(doc => doc.data());
      const submittedAssignments = submissions.length;

      // Calculate average grade
      const gradedSubmissions = submissions.filter(sub => sub.grade !== undefined && sub.grade !== null);
      const averageGrade = gradedSubmissions.length > 0
        ? gradedSubmissions.reduce((sum, sub) => sum + sub.grade, 0) / gradedSubmissions.length
        : 0;

      setStats({
        totalAssignments,
        submittedAssignments,
        averageGrade: Math.round(averageGrade * 10) / 10 // Round to 1 decimal place
      });
    } catch (error) {
      console.error('Error fetching student stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
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
                <dd className="text-lg font-medium text-gray-900">{stats.averageGrade > 0 ? stats.averageGrade : '--'}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
