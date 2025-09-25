// TeacherAssignments.tsx (shadcn/ui version)
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
import { Download, Edit, Trash2, FileText, Upload, X, CalendarIcon, Plus, Search } from 'lucide-react';
import { SkeletonList } from '../Skeletons';
import { uploadToCloudinary } from '../../lib/cloudinary';
import CreateAssignmentModal from './CreateAssignmentModal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

  // create assignment modal
  const [createModalVisible, setCreateModalVisible] = useState(false);

  // search functionality
  const [searchTerm, setSearchTerm] = useState('');

  // Filter assignments based on search term
  const filteredAssignments = assignments.filter(assignment =>
    assignment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (assignment.description && assignment.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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

        // Sort assignments by due date (closest first)
        const sortedAssignments = assignmentsData.sort((a, b) => {
          const dateA = a.due_date ? toDate(a.due_date) : new Date(0);
          const dateB = b.due_date ? toDate(b.due_date) : new Date(0);
          return dateA.getTime() - dateB.getTime();
        });

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
  }, [profile, toast]);

  const toDate = (timestamp: unknown): Date => {
    if (!timestamp) return new Date();
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) {
      return new Date((timestamp as { seconds: number }).seconds * 1000);
    }
    return new Date(timestamp as string | number | Date);
  };

  const downloadFile = useCallback(async (fileUrl: string, fileName: string) => {
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
  }, [toast]);

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
    const assignedDate = assignment.created_at ? toDate(assignment.created_at) : new Date();

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

          // Update assignment with new files
          if (uploadedFiles.length === 1) {
            // Single file - use old structure
            updatedData.file_url = uploadedFiles[0].file_url;
            updatedData.file_name = uploadedFiles[0].file_name;
            updatedData.files = deleteField();
          } else {
            // Multiple files - use new structure
            updatedData.files = uploadedFiles;
            updatedData.file_url = deleteField();
            updatedData.file_name = deleteField();
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
        // No new files, keep existing file structure
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
      toast({
        title: "Lỗi",
        description: "Lưu thay đổi thất bại. Vui lòng thử lại.",
        variant: "destructive",
      });
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      setNewFiles(prev => [...prev, ...fileArray]);
      toast({
        title: "Thành công",
        description: `${fileArray.length} file đã được chọn thành công`,
      });
    }
  };

  if (loading) {
    return <SkeletonList />;
  }

  return (
    <div className="modern-bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="modern-card-header p-6 sm:p-8 modern-animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg">
                  <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div>
                  <h1 className="modern-heading-2">Quản lý bài tập</h1>
                  <p className="modern-text-muted mt-2">Quản lý các bài tập đã tạo</p>
                </div>
              </div>
              <button
                onClick={() => setCreateModalVisible(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Tạo bài tập mới
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        {assignments.length > 0 && (
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm kiếm bài tập theo tiêu đề hoặc mô tả..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
              />
            </div>
          </div>
        )}

        {assignments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Chưa có bài tập nào</h3>
            <p className="mt-1 text-sm text-gray-500">
              Bạn chưa tạo bài tập nào. Hãy tạo bài tập đầu tiên để bắt đầu.
            </p>
            <button
              onClick={() => setCreateModalVisible(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm mx-auto"
            >
              <Plus className="w-4 h-4" />
              Tạo bài tập đầu tiên
            </button>
          </div>
        ) : filteredAssignments.length === 0 && searchTerm ? (
          <div className="text-center py-12">
            <Search className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Không tìm thấy bài tập nào</h3>
            <p className="mt-1 text-sm text-gray-500">
              Không có bài tập nào khớp với từ khóa "{searchTerm}"
            </p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm underline"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 hd-1366-grid-cols-3 gap-4 sm:gap-6">
            {filteredAssignments.map((assignment) => (
              <div key={assignment.id} className="modern-card p-4 sm:p-6 modern-animate-fade-in-scale lesson-card-hover">
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
                        <CalendarIcon className="w-4 h-4" />
                        Tạo: {assignment.created_at ? format(toDate(assignment.created_at), 'dd/MM/yyyy', { locale: vi }) : 'Chưa xác định'}
                      </span>
                      {assignment.due_date && (
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-4 h-4" />
                          Hạn nộp: {format(toDate(assignment.due_date), 'dd/MM/yyyy', { locale: vi })}
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
                        {assignment.files && assignment.files.length > 1 && (
                          <span className="bg-blue-100 text-blue-800 text-xs px-1.5 py-0.5 rounded-full ml-1">
                            {assignment.files.length}
                          </span>
                        )}
                      </button>
                    )}

                    {/* Edit button */}
                    <button
                      onClick={() => openEditModal(assignment)}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-lg transition-colors border border-gray-200 hover:border-gray-300 min-w-[80px]"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span className="font-medium">Chỉnh sửa</span>
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => confirmDelete(assignment.id!)}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300 min-w-[80px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="font-medium">Xóa</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Dialog open={editModalVisible} onOpenChange={setEditModalVisible}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa bài tập</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Tiêu đề</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Nhập tiêu đề bài tập"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Mô tả</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Nhập mô tả bài tập"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ngày giao</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.assigned_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.assigned_date ? format(formData.assigned_date, "dd/MM/yyyy", { locale: vi }) : "Chọn ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.assigned_date}
                      onSelect={(date) => date && setFormData(prev => ({ ...prev, assigned_date: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Hạn nộp</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.due_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.due_date ? format(formData.due_date, "dd/MM/yyyy", { locale: vi }) : "Chọn ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.due_date}
                      onSelect={(date) => date && setFormData(prev => ({ ...prev, due_date: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* File upload section */}
            <div className="space-y-2">
              <Label>File đính kèm mới</Label>
              <div className="space-y-4">
                {/* Current files display */}
                {editingAssignment?.files && editingAssignment.files.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-600">File hiện tại:</Label>
                    <div className="space-y-1">
                      {editingAssignment.files.map((file: { file_name: string }, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm text-gray-700">{file.file_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New files upload */}
                <div className="space-y-2">
                  <Label className="text-sm text-gray-600">Thêm file mới:</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx,.txt,.zip,.jpg,.jpeg,.png,.gif,.mp4,.mov"
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                    >
                      <Upload className="w-8 h-8 text-gray-400" />
                      <span className="text-sm text-gray-600">Chọn file hoặc kéo thả vào đây</span>
                      <span className="text-xs text-gray-500">Hỗ trợ: PDF, DOC, DOCX, TXT, ZIP, JPG, PNG, MP4</span>
                    </label>
                  </div>

                  {/* Selected files display */}
                  {newFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-gray-600">File đã chọn:</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={removeAllNewFiles}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Xóa tất cả
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {newFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                            <span className="text-sm text-gray-700">{file.name}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeNewFile(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setEditModalVisible(false);
                  setEditingAssignment(null);
                  setNewFiles([]);
                  setFormData({
                    title: '',
                    description: '',
                    due_date: new Date(),
                    assigned_date: new Date()
                  });
                }}
              >
                Hủy
              </Button>
              <Button
                onClick={handleEditSave}
                disabled={savingEdit || uploadingFile}
              >
                {savingEdit || uploadingFile ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalVisible} onOpenChange={setDeleteModalVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              Bạn có chắc chắn muốn xóa bài tập này? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteModalVisible(false);
                  setAssignmentToDelete(null);
                }}
              >
                Hủy
              </Button>
              <Button
                variant="destructive"
                onClick={() => assignmentToDelete && handleDelete(assignmentToDelete)}
              >
                Xóa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Assignment Modal */}
      <CreateAssignmentModal
        isOpen={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onSuccess={() => {
          toast({
            title: "Thành công",
            description: "Bài tập đã được tạo thành công!",
          });
        }}
      />
    </div>
  );
}