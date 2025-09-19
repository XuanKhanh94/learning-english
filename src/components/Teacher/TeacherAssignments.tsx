// TeacherAssignments.tsx (chỉnh sửa rút gọn, bỏ upload file mới)
import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc
} from 'firebase/firestore';
import { db, Assignment } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { FileText, Calendar, Download, Edit, Trash2 } from 'lucide-react';
import { message, Modal, Form, Input, DatePicker } from 'antd';
import dayjs from 'dayjs';

export function TeacherAssignments() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [form] = Form.useForm();

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

      const assignmentsData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as Assignment[];

      // Sort theo created_at (desc)
      const sortedAssignments = assignmentsData.sort((a, b) => {
        const dateA = a.created_at
          ? (a.created_at.toDate
            ? a.created_at.toDate().getTime()
            : new Date(a.created_at).getTime())
          : 0;
        const dateB = b.created_at
          ? (b.created_at.toDate
            ? b.created_at.toDate().getTime()
            : new Date(b.created_at).getTime())
          : 0;
        return dateB - dateA;
      });

      if (sortedAssignments.length === 0) {
        Modal.info({
          title: 'Chưa có bài tập nào',
          content: 'Hãy tạo bài tập đầu tiên của bạn.',
          okText: 'Đóng',
        });
      }

      setAssignments(sortedAssignments);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      message.error('Không thể tải danh sách bài tập, vui lòng thử lại!');
    } finally {
      setLoading(false);
    }
  };

  const toDate = (ts: any): Date | null => {
    if (!ts) return null;
    try {
      if (ts.toDate) return ts.toDate();
      if (ts.seconds) return new Date(ts.seconds * 1000);
      return new Date(ts);
    } catch {
      return null;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = toDate(timestamp);
    return date ? date.toLocaleDateString('vi-VN') : 'Ngày không hợp lệ';
  };

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = toDate(timestamp);
    return date ? date.toLocaleString('vi-VN') : 'Ngày không hợp lệ';
  };

  const downloadFile = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Network error');
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

      message.success(`Đã tải file "${fileName}" thành công`);
    } catch (error) {
      console.error('Error downloading file:', error);
      message.error('Lỗi khi tải file, vui lòng thử lại!');
    }
  };

  const confirmDelete = (assignmentId: string) => {
    Modal.confirm({
      title: 'Xác nhận xóa',
      content: 'Bạn có chắc chắn muốn xóa bài tập này?',
      okText: 'Xóa',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: () => handleDelete(assignmentId),
    });
  };

  const handleDelete = async (assignmentId: string) => {
    try {
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      message.success('Đã xóa bài tập thành công');
    } catch (error) {
      console.error('Error deleting assignment:', error);
      message.error('Xóa bài tập thất bại');
    }
  };

  // mở modal chỉnh sửa
  const openEditModal = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    const dueDate = assignment.due_date ? toDate(assignment.due_date) : null;
    form.setFieldsValue({
      title: assignment.title || '',
      description: assignment.description || '',
      due_date: dueDate ? dayjs(dueDate) : null,
    });
    setEditModalVisible(true);
  };

  const handleEditSave = async () => {
    try {
      const values = await form.validateFields();
      if (!editingAssignment) return;

      setSavingEdit(true);

      const updatedData: any = {
        title: values.title,
        description: values.description,
        due_date: values.due_date ? values.due_date.toDate() : null,
      };

      await updateDoc(doc(db, 'assignments', editingAssignment.id!), updatedData);

      setAssignments(prev =>
        prev.map(a =>
          a.id === editingAssignment.id
            ? {
              ...a,
              ...updatedData,
            }
            : a
        )
      );

      message.success('Cập nhật bài tập thành công');
      setEditModalVisible(false);
      setEditingAssignment(null);
      form.resetFields();
    } catch (err: any) {
      console.error('Failed to save edit:', err);
      if (!err?.errorFields) {
        message.error('Lưu thay đổi thất bại. Vui lòng thử lại.');
      }
    } finally {
      setSavingEdit(false);
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

      {assignments.length > 0 && (
        <div className="grid gap-6">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="bg-white rounded-lg shadow-md p-6"
            >
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
                      onClick={() =>
                        downloadFile(
                          assignment.file_url!,
                          assignment.file_name || 'assignment'
                        )
                      }
                      className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Tải file
                    </button>
                  )}

                  <button
                    onClick={() => openEditModal(assignment)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Chỉnh sửa
                  </button>

                  <button
                    onClick={() => confirmDelete(assignment.id!)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Xóa
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        title="Chỉnh sửa bài tập"
        open={editModalVisible}
        onOk={handleEditSave}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingAssignment(null);
          form.resetFields();
        }}
        okButtonProps={{ loading: savingEdit }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={4} />
          </Form.Item>

          <Form.Item name="due_date" label="Hạn nộp">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
