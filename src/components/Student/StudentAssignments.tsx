import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, orderBy, serverTimestamp, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, Assignment, AssignmentStudent, Submission } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { useAuth } from '../../hooks/useAuth';
import { Download, Upload, Clock, CheckCircle, AlertCircle, Calendar, FileText, FileDown, Eye } from 'lucide-react';
import { SkeletonList } from '../Skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

export function StudentAssignments() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<(AssignmentStudent & { assignment?: Assignment; submission?: Submission })[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<(AssignmentStudent & { assignment?: Assignment; submission?: Submission }) | null>(null);

  useEffect(() => {
    if (!profile) return;

    setLoading(true);

    // Setup realtime listener for assignment_students
    const assignmentStudentsQuery = query(
      collection(db, 'assignment_students'),
      where('student_id', '==', profile.id)
    );

    const unsubscribeAssignmentStudents = onSnapshot(assignmentStudentsQuery, async (snapshot) => {
      try {
        const assignmentStudents = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data
          } as AssignmentStudent;
        });

        // Fetch assignment details for each assignment_student
        const assignmentsWithDetails = await Promise.all(
          assignmentStudents.map(async (assignmentStudent) => {
            try {
              const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentStudent.assignment_id));
              const assignment = assignmentDoc.exists() ? {
                id: assignmentDoc.id,
                ...assignmentDoc.data()
              } as Assignment : undefined;

              // Fetch submission if exists
              const submissionsQuery = query(
                collection(db, 'submissions'),
                where('assignment_id', '==', assignmentStudent.assignment_id),
                where('student_id', '==', profile.id)
              );
              const submissionsSnapshot = await getDocs(submissionsQuery);
              const submission = submissionsSnapshot.docs.length > 0 ? {
                id: submissionsSnapshot.docs[0].id,
                ...submissionsSnapshot.docs[0].data()
              } as Submission : undefined;

              return {
                ...assignmentStudent,
                assignment,
                submission
              };
            } catch (error) {
              console.error('Error fetching assignment details:', error);
              return {
                ...assignmentStudent,
                assignment: undefined,
                submission: undefined
              };
            }
          })
        );

        // Log total assignments before filtering
        console.log(`Total assignments for student ${profile.email}:`, assignmentsWithDetails.length);

        // Filter out test assignments
        const filteredAssignments = assignmentsWithDetails.filter(assignment => {
          const title = assignment.assignment?.title?.toLowerCase() || '';
          const description = assignment.assignment?.description?.toLowerCase() || '';
          const isTestAssignment = title.includes('test') || description.includes('test');

          // Log for debugging
          if (isTestAssignment) {
            console.log('Filtering out test assignment:', {
              title: assignment.assignment?.title,
              description: assignment.assignment?.description,
              assignmentId: assignment.assignment_id
            });
          }

          return !isTestAssignment;
        });

        // Log assignments after filtering
        console.log(`Assignments after filtering for student ${profile.email}:`, filteredAssignments.length);

        // Sort by due date (closest first)
        const sortedAssignments = filteredAssignments.sort((a, b) => {
          const dateA = a.assignment?.due_date ? new Date(a.assignment.due_date) : new Date(0);
          const dateB = b.assignment?.due_date ? new Date(b.assignment.due_date) : new Date(0);
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
    });

    // Setup realtime listener for submissions
    const submissionsQuery = query(
      collection(db, 'submissions'),
      where('student_id', '==', profile.id)
    );

    const unsubscribeSubmissions = onSnapshot(submissionsQuery, (snapshot) => {
      try {
        const submissions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Submission[];

        // Update assignments with latest submission data
        setAssignments(prev => prev.map(assignment => {
          const latestSubmission = submissions.find(sub => sub.assignment_id === assignment.assignment_id);
          return {
            ...assignment,
            submission: latestSubmission
          };
        }));
      } catch (error) {
        console.error('Error processing submissions:', error);
      }
    });

    // Cleanup function
    return () => {
      unsubscribeAssignmentStudents();
      unsubscribeSubmissions();
    };
  }, [profile, toast]);

  const toDate = (timestamp: any): Date => {
    if (!timestamp) return new Date();
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000);
    }
    return new Date(timestamp);
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
  };

  const getStatusText = (assignment: AssignmentStudent & { assignment?: Assignment; submission?: Submission }) => {
    if (assignment.submission) {
      switch (assignment.submission.status) {
        case 'submitted':
          return 'Đã nộp';
        case 'graded':
          return `Đã chấm (${assignment.submission.grade}/10)`;
        default:
          return 'Đang xử lý';
      }
    }
    return 'Chưa nộp';
  };

  const getStatusBadge = (assignment: AssignmentStudent & { assignment?: Assignment; submission?: Submission }) => {
    if (assignment.submission) {
      switch (assignment.submission.status) {
        case 'submitted':
          return (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-600">Đã nộp</span>
            </div>
          );
        case 'graded':
          return (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-600">Đã chấm ({assignment.submission.grade}/10)</span>
            </div>
          );
        default:
          return (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-600">Đang xử lý</span>
            </div>
          );
      }
    }
    return (
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-gray-600" />
        <span className="text-sm font-medium text-gray-600">Chưa nộp</span>
      </div>
    );
  };

  const handleFileUpload = async (assignmentId: string, files: File[]) => {
    if (!profile) return;

    setUploading(assignmentId);
    try {
      const uploadedFiles = [];
      for (const file of files) {
        const uploadResult = await uploadToCloudinary(file, `submissions/${profile.id}`);
        uploadedFiles.push({
          file_url: uploadResult.secure_url,
          file_name: file.name,
          uploaded_at: new Date().toISOString(),
          description: ''
        });
      }

      await addDoc(collection(db, 'submissions'), {
        assignment_id: assignmentId,
        student_id: profile.id,
        files: uploadedFiles,
        submitted_at: serverTimestamp(),
        status: 'submitted'
      });

      toast({
        title: "Thành công",
        description: "Nộp bài thành công!",
      });
    } catch (error) {
      console.error('Error uploading submission:', error);
      toast({
        title: "Lỗi",
        description: "Lỗi khi nộp bài, vui lòng thử lại!",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
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
                  <h1 className="modern-heading-2">Bài tập của tôi</h1>
                  <p className="modern-text-muted mt-2">Quản lý và nộp bài tập được giao</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {assignments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Chưa có bài tập nào</h3>
            <p className="mt-1 text-sm text-gray-500">
              Bạn chưa được giao bài tập nào.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 hd-1366-grid-cols-3 gap-4 sm:gap-6">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 modern-animate-fade-in-scale hover:shadow-xl transition-shadow duration-300 cursor-pointer"
                onClick={() => setSelectedAssignment(assignment)}
              >
                {/* Header với tiêu đề và trạng thái */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getStatusBadge(assignment)}
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">
                        {assignment.assignment?.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Hạn nộp: {assignment.assignment?.due_date ? format(toDate(assignment.assignment.due_date), 'dd/MM/yyyy', { locale: vi }) : 'Chưa xác định'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Nội dung bài tập */}
                {assignment.assignment?.description && (
                  <div className="mb-4">
                    <p className="text-gray-700 text-sm line-clamp-3">
                      {assignment.assignment.description}
                    </p>
                  </div>
                )}

                {/* File download section */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700">Tải đề bài</span>
                    {assignment.assignment?.files && assignment.assignment.files.length > 1 && (
                      <span className="bg-blue-100 text-blue-800 text-xs px-1.5 py-0.5 rounded-full">
                        {assignment.assignment.files.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (assignment.assignment?.files && assignment.assignment.files.length > 1) {
                        // Multiple files - download all
                        assignment.assignment.files.forEach((file: any) => {
                          downloadFile(file.file_url, file.file_name);
                        });
                      } else if (assignment.assignment?.file_url) {
                        // Single file
                        downloadFile(assignment.assignment.file_url, assignment.assignment.file_name || 'assignment_file');
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300"
                  >
                    <Download className="w-3 h-3" />
                    Tải xuống
                  </button>
                </div>

                {/* Submission files download */}
                {assignment.submission?.files && assignment.submission.files.length > 0 && (
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FileDown className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-700">Tải bài nộp</span>
                      {assignment.submission.files.length > 1 && (
                        <span className="bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded-full">
                          {assignment.submission.files.length}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        assignment.submission?.files?.forEach((file: any) => {
                          downloadFile(file.file_url, file.file_name);
                        });
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-green-200 hover:border-green-300"
                    >
                      <Download className="w-3 h-3" />
                      Tải xuống
                    </button>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAssignment(assignment);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-lg transition-colors border border-gray-200 hover:border-gray-300"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="font-medium">Xem chi tiết</span>
                  </button>
                  {!assignment.submission && (
                    <label className="flex-1">
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0 && assignment.assignment?.id) {
                            handleFileUpload(assignment.assignment.id, Array.from(files));
                          }
                        }}
                        className="hidden"
                      />
                      <div
                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border cursor-pointer ${uploading === assignment.assignment?.id
                          ? 'text-gray-400 bg-gray-50 border-gray-200'
                          : 'text-green-600 hover:bg-green-50 border-green-200 hover:border-green-300'
                          }`}
                      >
                        {uploading === assignment.assignment?.id ? (
                          <>
                            <Upload className="w-3.5 h-3.5 animate-spin" />
                            <span className="font-medium">Đang nộp...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span className="font-medium">Nộp bài</span>
                          </>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignment Detail Modal */}
      <Dialog open={!!selectedAssignment} onOpenChange={() => setSelectedAssignment(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedAssignment && (
            <div className="space-y-6">
              {/* Header modal */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusBadge(selectedAssignment)}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {selectedAssignment.assignment?.title}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-gray-500">Trạng thái:</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${selectedAssignment.submission?.status === 'graded'
                        ? 'bg-green-100 text-green-800'
                        : selectedAssignment.submission?.status === 'submitted'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {getStatusText(selectedAssignment)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mô tả bài tập */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Mô tả bài tập</h3>
                <p className="text-gray-700 leading-relaxed">
                  {selectedAssignment.assignment?.description || 'Chưa có mô tả chi tiết cho bài tập này.'}
                </p>
              </div>

              {/* Thông tin thời gian */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Calendar className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Ngày giao</p>
                    <p className="text-lg text-blue-700">
                      {selectedAssignment.assignment?.created_at ? format(toDate(selectedAssignment.assignment.created_at), 'dd/MM/yyyy', { locale: vi }) : 'Không xác định'}
                    </p>
                  </div>
                </div>

                {selectedAssignment.assignment?.due_date && (
                  <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg">
                    <Clock className="w-6 h-6 text-orange-600" />
                    <div>
                      <p className="text-sm font-medium text-orange-900">Hạn nộp</p>
                      <p className="text-lg text-orange-700">
                        {format(toDate(selectedAssignment.assignment.due_date), 'dd/MM/yyyy HH:mm', { locale: vi })}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* File đề bài */}
              {((selectedAssignment.assignment?.file_url && !selectedAssignment.assignment?.files) || (selectedAssignment.assignment?.files && selectedAssignment.assignment.files.length > 0)) && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-center gap-2 mb-4">
                    <FileDown className="w-6 h-6 text-blue-600" />
                    <h3 className="text-lg font-semibold text-blue-900">File đề bài</h3>
                    {selectedAssignment.assignment?.files && selectedAssignment.assignment.files.length > 1 && (
                      <span className="text-sm bg-blue-200 text-blue-800 px-2 py-1 rounded-full">
                        {selectedAssignment.assignment.files.length} file
                      </span>
                    )}
                  </div>

                  {selectedAssignment.assignment?.files && selectedAssignment.assignment.files.length > 0 ? (
                    <div className="space-y-3">
                      {selectedAssignment.assignment.files.map((file: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-200">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-blue-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{file.file_name}</p>
                              {file.description && (
                                <p className="text-xs text-gray-600">{file.description}</p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => downloadFile(file.file_url, file.file_name)}
                            className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300"
                          >
                            <Download className="w-4 h-4" />
                            <span className="font-medium">Tải</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-200">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{selectedAssignment.assignment?.file_name || 'assignment'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadFile(selectedAssignment.assignment!.file_url!, selectedAssignment.assignment!.file_name || 'assignment')}
                        className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300"
                      >
                        <Download className="w-4 h-4" />
                        <span className="font-medium">Tải</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Bài nộp của học sinh */}
              {selectedAssignment.submission && (
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Upload className="w-6 h-6 text-green-600" />
                    <h3 className="text-lg font-semibold text-green-900">Bài nộp của bạn</h3>
                    {selectedAssignment.submission.files && selectedAssignment.submission.files.length > 1 && (
                      <span className="text-sm bg-green-200 text-green-800 px-2 py-1 rounded-full">
                        {selectedAssignment.submission.files.length} file
                      </span>
                    )}
                  </div>

                  {selectedAssignment.submission.files && selectedAssignment.submission.files.length > 0 ? (
                    <div className="space-y-3">
                      {selectedAssignment.submission.files.map((file: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-200">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-green-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{file.file_name}</p>
                              {index === 0 && selectedAssignment.submission?.submitted_at && (
                                <p className="text-xs text-gray-600">
                                  Nộp lúc: {format(toDate(selectedAssignment.submission.submitted_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => downloadFile(file.file_url, file.file_name)}
                            className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-green-200 hover:border-green-300"
                          >
                            <Download className="w-4 h-4" />
                            <span className="font-medium">Tải</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-200">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{selectedAssignment.submission.file_name}</p>
                          {selectedAssignment.submission.submitted_at && (
                            <p className="text-xs text-gray-600">
                              Nộp lúc: {format(toDate(selectedAssignment.submission.submitted_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => downloadFile(selectedAssignment.submission!.file_url, selectedAssignment.submission!.file_name)}
                        className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-green-200 hover:border-green-300"
                      >
                        <Download className="w-4 h-4" />
                        <span className="font-medium">Tải</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Nhận xét từ giáo viên */}
              <div className="bg-blue-50 rounded-xl p-4 border-l-4 border-blue-400">
                <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Nhận xét từ giáo viên
                </h3>
                <p className="text-gray-800 leading-relaxed">
                  {selectedAssignment.submission?.teacher_feedback || selectedAssignment.submission?.feedback || 'Giáo viên chưa có nhận xét cho bài tập này.'}
                </p>
              </div>

              {/* Nút nộp bài trong modal */}
              {!selectedAssignment.submission && (
                <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                  <h3 className="text-lg font-semibold text-yellow-900 mb-3">Nộp bài tập</h3>
                  <p className="text-yellow-800 mb-4">Bạn chưa nộp bài tập này. Hãy chọn file để nộp bài.</p>
                  <label className="block">
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0 && selectedAssignment.assignment?.id) {
                          handleFileUpload(selectedAssignment.assignment.id, Array.from(files));
                        }
                      }}
                      className="hidden"
                    />
                    <div
                      className={`flex items-center justify-center gap-2 px-6 py-3 text-sm rounded-lg transition-colors border cursor-pointer ${uploading === selectedAssignment.assignment?.id
                        ? 'text-gray-400 bg-gray-50 border-gray-200'
                        : 'text-yellow-600 hover:bg-yellow-100 border-yellow-200 hover:border-yellow-300'
                        }`}
                    >
                      {uploading === selectedAssignment.assignment?.id ? (
                        <>
                          <Upload className="w-4 h-4 animate-spin" />
                          <span className="font-medium">Đang nộp...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span className="font-medium">Chọn file để nộp bài</span>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}