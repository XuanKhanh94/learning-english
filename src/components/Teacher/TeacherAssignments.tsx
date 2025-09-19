import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db, Assignment } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { FileText, Users, Calendar, Download, Edit, Trash2, Eye } from 'lucide-react';

export function TeacherAssignments() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchAssignments();
    }
  }, [profile]);

  const fetchAssignments = async () => {
    if (!profile) return;

    try {
      const q = query(
        collection(db, 'assignments'),
        where('teacher_id', '==', profile.id)
      );
      const querySnapshot = await getDocs(q);

      const assignmentsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Assignment[];

      // Sort by created_at in memory instead of using Firestore orderBy
      // SỬA: Convert Timestamp to Date trước khi sort
      const sortedAssignments = assignmentsData.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at.toDate()).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at.toDate()).getTime() : 0;
        return dateB - dateA; // desc order
      });

      setAssignments(sortedAssignments);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  // HÀM HELPER: Để convert Timestamp an toàn (tránh lỗi nếu không phải Timestamp)
  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('vi-VN');
    } catch {
      return 'Ngày không hợp lệ';
    }
  };

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('vi-VN');
    } catch {
      return 'Ngày không hợp lệ';
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bài tập của tôi</h1>
        <p className="text-gray-600">Quản lý các bài tập đã tạo</p>
      </div>

      {assignments.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Chưa có bài tập nào</h3>
          <p className="mt-1 text-sm text-gray-500">
            Hãy tạo bài tập đầu tiên của bạn.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {assignment.title}
                  </h3>

                  {assignment.description && (
                    <p className="text-gray-700 mb-4">
                      {assignment.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Tạo: {formatDate(assignment.created_at)}
                    </span>
                    {assignment.due_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Hạn nộp: {formatDateTime(assignment.due_date)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  {assignment.file_url && (
                    <button
                      onClick={() => downloadFile(assignment.file_url!, assignment.file_name!)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Tải file
                    </button>
                  )}

                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                    <Eye className="w-4 h-4" />
                    Xem bài nộp
                  </button>

                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                    <Edit className="w-4 h-4" />
                    Chỉnh sửa
                  </button>

                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                    Xóa
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}