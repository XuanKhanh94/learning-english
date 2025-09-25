// TeacherAssignments.tsx (tối ưu hóa hiệu suất)
import React, { useState, useEffect, useCallback } from 'react';
import {
  updateDoc,
  doc,
  deleteDoc,
  deleteField,
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db, Assignment } from '../../lib/firebase';
import { firebaseCache } from '../../lib/firebase-cache';
import { useAuth } from '../../hooks/useAuth';
import { Download, Edit, Trash2, FileText, Upload, X } from 'lucide-react';
import { SkeletonList } from '../Skeletons';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function TeacherAssignments() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: new Date(),
    assigned_date: new Date()
  });
  
  // Delete confirmation
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    setLoading(true);

    // Setup realtime listener for assignments
    const assignmentsQuery = query(
      collection(db, 'assignments'),
      where('teacher_id', '==', profile.id),
      orderBy('created_at', 'desc')
    );

    const unsubscribeAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
      try {
        const assignmentsData = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as Assignment[];

        // Sort theo created_at (desc) - already sorted by query
        const sortedAssignments = assignmentsData.sort((a, b) => {
          const dateA = a.created_at
            ? (typeof a.created_at === 'object' && a.created_at !== null && 'toDate' in a.created_at
              ? (a.created_at as { toDate: () => Date }).toDate().getTime()
              : new Date(a.created_at as string).getTime())
            : 0;
          const dateB = b.created_at
            ? (typeof b.created_at === 'object' && b.created_at !== null && 'toDate' in b.created_at
              ? (b.created_at as { toDate: () => Date }).toDate().getTime()
              : new Date(b.created_at as string).getTime())
            : 0;
          return dateB - dateA;
        });

        if (sortedAssignments.length === 0 && !loading) {
          Modal.info({
            title: 'Chưa có bài tập nào',
            content: 'Hãy tạo bài tập đầu tiên của bạn.',
            okText: 'Đóng',
          });
        }

        setAssignments(sortedAssignments);
      } catch (error) {
        console.error('Error processing assignments:', error);
        toast({
          title: "Lỗi",
          description: "Không thể tải danh sách bài tập, vui lòng thử lại!",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error('Error in assignments listener:', error);
      toast({
        title: "Lỗi",
        description: "Không thể kết nối để tải danh sách bài tập!",
        variant: "destructive",
      });
      setLoading(false);
    });

    // Cleanup function
    return () => {
      unsubscribeAssignments();
    };
  }, [profile]);

  // Memoized utility functions
  const toDate = useCallback((ts: unknown): Date | null => {
    if (!ts) return null;
    try {
      if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
        return (ts as { toDate: () => Date }).toDate();
      }
      if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
        return new Date((ts as { seconds: number }).seconds * 1000);
      }
      return new Date(ts as string | number);
    } catch {
      return null;
    }
  }, []);

  const formatDate = useCallback((timestamp: unknown) => {
    if (!timestamp) return '';
    const date = toDate(timestamp);
    return date ? date.toLocaleDateString('vi-VN') : 'Ngày không hợp lệ';
  }, [toDate]);

  const formatDateTime = useCallback((timestamp: unknown) => {
    if (!timestamp) return '';
    const date = toDate(timestamp);
    return date ? date.toLocaleString('vi-VN') : 'Ngày không hợp lệ';
  }, [toDate]);

  const downloadFile = useCallback(async (fileUrl: string, fileName: string) => {
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

      toast({
        title: "Thành công",
        description: `Đã tải file "${fileName}" thành công`,
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Lỗi",
        description: "Lỗi khi tải file, vui lòng thử lại!",
        variant: "destructive",
      });
    }
  }, []);

  const confirmDelete = (assignmentId: string) => {
    setAssignmentToDelete(assignmentId);
    setDeleteModalVisible(true);
  };

  const handleDelete = useCallback(async (assignmentId: string) => {
    try {
      await deleteDoc(doc(db, 'assignments', assignmentId));
      // Data will be automatically updated via realtime listener
      firebaseCache.invalidateAssignmentCache(profile?.id);
      toast({
        title: "Thành công",
        description: "Đã xóa bài tập thành công",
      });
      setDeleteModalVisible(false);
      setAssignmentToDelete(null);
    } catch (error) {
      console.error('Error deleting assignment:', error);
      toast({
        title: "Lỗi",
        description: "Xóa bài tập thất bại",
        variant: "destructive",
      });
    }
  }, [profile?.id, toast]);

  // mở modal chỉnh sửa
  const openEditModal = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setNewFiles([]); // Reset files state
    const dueDate = assignment.due_date ? toDate(assignment.due_date) : new Date();
    const assignedDate = assignment.assigned_date ? toDate(assignment.assigned_date) : new Date();
    
    setFormData({
      title: assignment.title || '',
      description: assignment.description || '',
      due_date: dueDate,
      assigned_date: assignedDate
    });
    setEditModalVisible(true);
  };

  const handleEditSave = useCallback(async () => {
    try {
      if (!editingAssignment) return;

      setSavingEdit(true);

      const updatedData: Record<string, unknown> = {
        title: formData.title,
        description: formData.description,
        due_date: formData.due_date,
        assigned_date: formData.assigned_date,
      };

      // Handle new files upload if there are any
      console.log('Checking for new files:', newFiles);
      if (newFiles.length > 0) {
        console.log('Uploading new files:', newFiles.map(f => f.name));
        setUploadingFile(true);
        try {
          const uploadedFiles = [];
          for (const file of newFiles) {
            const uploadResult = await uploadToCloudinary(file, `assignments/${profile?.id}`);
            uploadedFiles.push({
              file_url: uploadResult.secure_url,
              file_name: file.name,
              uploaded_at: new Date().toISOString(),
              description: ''
            });
          }
          console.log('Upload results:', uploadedFiles);

          // If multiple files, use files array and clear single file fields
          if (uploadedFiles.length > 1) {
            updatedData.files = uploadedFiles;
            updatedData.file_url = deleteField();
            updatedData.file_name = deleteField();
          } else {
            // If single file, use single file fields and clear files array
            updatedData.file_url = uploadedFiles[0].file_url;
            updatedData.file_name = uploadedFiles[0].file_name;
            updatedData.files = deleteField();
          }
        } catch (uploadError) {
          console.error('Error uploading files:', uploadError);
          toast({
            title: "Lỗi",
            description: "Lỗi upload file. Vui lòng thử lại.",
            variant: "destructive",
          });
          return;
        } finally {
          setUploadingFile(false);
        }
      } else {
        console.log('No new files to upload');
      }

      await updateDoc(doc(db, 'assignments', editingAssignment.id!), updatedData);

      // Data will be automatically updated via realtime listener
      firebaseCache.invalidateAssignmentCache(profile?.id);
      toast({
        title: "Thành công",
        description: "Cập nhật bài tập thành công",
      });
      setEditModalVisible(false);
      setEditingAssignment(null);
      setNewFiles([]);
      setFormData({
        title: '',
        description: '',
        due_date: new Date(),
        assigned_date: new Date()
      });
    } catch (err: unknown) {
      console.error('Failed to save edit:', err);
      if (!(err as { errorFields?: unknown })?.errorFields) {
        toast({
          title: "Lỗi",
          description: "Lưu thay đổi thất bại. Vui lòng thử lại.",
          variant: "destructive",
        });
      }
    } finally {
      setSavingEdit(false);
    }
  }, [editingAssignment, formData, profile?.id, newFiles, toast]);

  const removeNewFile = (index: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeAllNewFiles = () => {
    setNewFiles([]);
  };

  // Memoized assignment card component
  const AssignmentCard = React.memo(({ assignment }: { assignment: Assignment }) => (
    <div className="modern-card p-4 sm:p-6 modern-animate-fade-in-scale lesson-card-hover">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
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

        <div className="flex flex-row sm:flex-col gap-2 sm:ml-4">
          {/* Download button */}
          {((assignment.file_url && !assignment.files) || (assignment.files && assignment.files.length > 0)) && (
            <button
              onClick={() => {
                if (assignment.file_url && !assignment.files) {
                  // Single file
                  downloadFile(assignment.file_url, assignment.file_name || 'assignment');
                } else if (assignment.files && assignment.files.length > 0) {
                  // Multiple files - download first file as example
                  downloadFile(assignment.files[0].file_url, assignment.files[0].file_name);
                }
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300 min-w-[80px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="font-medium">Tải file</span>
              {/* Show file count only when there are multiple files */}
              {assignment.files && assignment.files.length > 1 && (
                <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold ml-0.5">
                  {assignment.files.length}
                </span>
              )}
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
  ));

  if (loading) {
    return <SkeletonList count={6} />;
  }

  return (
    <div className="modern-bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="modern-card p-6 sm:p-8 modern-animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg">
                  <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div>
                  <h1 className="modern-heading-2">Bài tập của tôi</h1>
                  <p className="modern-text-muted mt-2">Quản lý các bài tập đã tạo</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {assignments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 hd-1366-grid-cols-3 gap-4 sm:gap-6">
            {assignments.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
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
            setNewFiles([]);
            form.resetFields();
          }}
          okButtonProps={{ loading: savingEdit || uploadingFile }}
          destroyOnHidden
          width={600}
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

            <Form.Item label="File đính kèm">
              <div className="space-y-4">
                {/* Hiển thị file hiện tại */}
                {editingAssignment && (editingAssignment.file_url || (editingAssignment.files && editingAssignment.files.length > 0)) && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">File hiện tại:</span>
                    </div>
                    {editingAssignment.file_url && (
                      <div className="flex items-center p-2 bg-white rounded border">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-900">{editingAssignment.file_name}</span>
                        </div>
                      </div>
                    )}
                    {editingAssignment.files && editingAssignment.files.length > 0 && (
                      <div className="space-y-1">
                        {editingAssignment.files.slice(0, 3).map((file, index) => (
                          <div key={index} className="flex items-center p-2 bg-white rounded border">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-gray-500" />
                              <span className="text-sm text-gray-900">{file.file_name}</span>
                            </div>
                          </div>
                        ))}
                        {editingAssignment.files.length > 3 && (
                          <p className="text-xs text-blue-600 text-center">
                            +{editingAssignment.files.length - 3} file khác
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Upload file mới */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Upload className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-700">Thay thế bằng file mới:</span>
                  </div>
                  <AntUpload
                    beforeUpload={(file) => {
                      console.log('Before upload file:', file);
                      setNewFiles(prev => [...prev, file]);
                      toast({
                        title: "Thành công",
                        description: "File đã được chọn thành công",
                      });
                      return false; // Prevent auto upload
                    }}
                    showUploadList={false}
                    accept=".pdf,.doc,.docx,.txt,.zip,.jpg,.jpeg,.png,.gif,.mp4,.mov"
                    multiple={true}
                  >
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-green-500 transition-colors cursor-pointer">
                      <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">Click để chọn file mới</p>
                      <p className="text-xs text-gray-500">PDF, DOC, DOCX, TXT, ZIP, JPG, PNG, MP4, MOV</p>
                    </div>
                  </AntUpload>
                </div>

                {/* Hiển thị files đã chọn */}
                {newFiles.length > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-800">
                          {newFiles.length} file đã chọn
                        </span>
                      </div>
                      <button
                        onClick={removeAllNewFiles}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Xóa tất cả
                      </button>
                    </div>
                    <div className="space-y-2">
                      {newFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-900">{file.name}</span>
                            <span className="text-xs text-gray-500">
                              ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                          </div>
                          <button
                            onClick={() => removeNewFile(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
}
