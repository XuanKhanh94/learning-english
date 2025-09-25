import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, orderBy, serverTimestamp, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, Assignment, AssignmentStudent, Submission } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { useAuth } from '../../hooks/useAuth';
import { Download, Upload, Clock, CheckCircle, AlertCircle, Calendar, FileText, FileDown } from 'lucide-react';
import { SkeletonList } from '../Skeletons';

export function StudentAssignments() {
  const { profile } = useAuth();
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
            ...data,
            assigned_at: data.assigned_at ? (data.assigned_at.toDate ? data.assigned_at.toDate() : new Date(data.assigned_at)) : null
          };
        }) as AssignmentStudent[];

        if (assignmentStudents.length === 0) {
          setAssignments([]);
          setLoading(false);
          return;
        }

        // Fetch assignment details and submissions for each assignment
        const enrichedAssignments = await Promise.all(
          assignmentStudents.map(async (assignmentStudent) => {
            // Fetch assignment details
            const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentStudent.assignment_id));
            const assignment = assignmentDoc.exists() ?
              {
                id: assignmentDoc.id,
                ...assignmentDoc.data(),
                due_date: assignmentDoc.data().due_date ? (assignmentDoc.data().due_date.toDate ? assignmentDoc.data().due_date.toDate() : new Date(assignmentDoc.data().due_date)) : null
              } as Assignment :
              null;

            // Fetch submission if exists
            const submissionQuery = query(
              collection(db, 'submissions'),
              where('assignment_id', '==', assignmentStudent.assignment_id),
              where('student_id', '==', profile.id)
            );
            const submissionSnapshot = await getDocs(submissionQuery);
            const submission = submissionSnapshot.docs[0] ?
              {
                id: submissionSnapshot.docs[0].id,
                ...submissionSnapshot.docs[0].data(),
                submitted_at: submissionSnapshot.docs[0].data().submitted_at ? (submissionSnapshot.docs[0].data().submitted_at.toDate ? submissionSnapshot.docs[0].data().submitted_at.toDate() : new Date(submissionSnapshot.docs[0].data().submitted_at)) : null
              } as Submission :
              null;

            return {
              ...assignmentStudent,
              assignment,
              submission
            };
          })
        );

        // Filter out assignments where assignment data couldn't be fetched
        const validAssignments = enrichedAssignments.filter(item => item.assignment);

        // Sort by assigned_at date
        validAssignments.sort((a, b) => {
          const dateA = a.assigned_at ? a.assigned_at.getTime() : 0;
          const dateB = b.assigned_at ? b.assigned_at.getTime() : 0;
          return dateB - dateA; // desc order
        });

        setAssignments(validAssignments);
      } catch (error) {
        console.error('Error processing assignment students:', error);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error('Error in assignment students listener:', error);
      setLoading(false);
    });

    // Setup realtime listener for submissions
    const submissionsQuery = query(
      collection(db, 'submissions'),
      where('student_id', '==', profile.id)
    );

    const unsubscribeSubmissions = onSnapshot(submissionsQuery, async (snapshot) => {
      try {
        // When submissions change, we need to refresh the assignments data
        // This will trigger the assignment students listener to re-fetch submission data
        const assignmentStudentsQuery = query(
          collection(db, 'assignment_students'),
          where('student_id', '==', profile.id)
        );

        const assignmentStudentsSnapshot = await getDocs(assignmentStudentsQuery);
        const assignmentStudents = assignmentStudentsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            assigned_at: data.assigned_at ? (data.assigned_at.toDate ? data.assigned_at.toDate() : new Date(data.assigned_at)) : null
          };
        }) as AssignmentStudent[];

        if (assignmentStudents.length === 0) {
          setAssignments([]);
          return;
        }

        // Re-fetch enriched assignments with updated submissions
        const enrichedAssignments = await Promise.all(
          assignmentStudents.map(async (assignmentStudent) => {
            const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentStudent.assignment_id));
            const assignment = assignmentDoc.exists() ?
              {
                id: assignmentDoc.id,
                ...assignmentDoc.data(),
                due_date: assignmentDoc.data().due_date ? (assignmentDoc.data().due_date.toDate ? assignmentDoc.data().due_date.toDate() : new Date(assignmentDoc.data().due_date)) : null
              } as Assignment :
              null;

            const submissionQuery = query(
              collection(db, 'submissions'),
              where('assignment_id', '==', assignmentStudent.assignment_id),
              where('student_id', '==', profile.id)
            );
            const submissionSnapshot = await getDocs(submissionQuery);
            const submission = submissionSnapshot.docs[0] ?
              {
                id: submissionSnapshot.docs[0].id,
                ...submissionSnapshot.docs[0].data(),
                submitted_at: submissionSnapshot.docs[0].data().submitted_at ? (submissionSnapshot.docs[0].data().submitted_at.toDate ? submissionSnapshot.docs[0].data().submitted_at.toDate() : new Date(submissionSnapshot.docs[0].data().submitted_at)) : null
              } as Submission :
              null;

            return {
              ...assignmentStudent,
              assignment,
              submission
            };
          })
        );

        const validAssignments = enrichedAssignments.filter(item => item.assignment);
        validAssignments.sort((a, b) => {
          const dateA = a.assigned_at ? a.assigned_at.getTime() : 0;
          const dateB = b.assigned_at ? b.assigned_at.getTime() : 0;
          return dateB - dateA;
        });

        setAssignments(validAssignments);
      } catch (error) {
        console.error('Error processing submissions update:', error);
      }
    }, (error) => {
      console.error('Error in submissions listener:', error);
    });

    // Cleanup function
    return () => {
      unsubscribeAssignmentStudents();
      unsubscribeSubmissions();
    };
  }, [profile]);

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

  const handleFileUpload = async (assignmentId: string, files: File[]) => {
    if (!profile || files.length === 0) return;

    setUploading(assignmentId);

    try {
      if (files.length === 1) {
        // Single file - keep existing structure
        const file = files[0];
        const uploadResult = await uploadToCloudinary(file, `submissions/${profile.id}/${assignmentId}`);

        await addDoc(collection(db, 'submissions'), {
          assignment_id: assignmentId,
          student_id: profile.id,
          file_url: uploadResult.secure_url,
          file_name: file.name,
          status: 'submitted',
          submitted_at: serverTimestamp(),
        });
      } else {
        // Multiple files - upload all and store as array
        const uploadPromises = files.map(file =>
          uploadToCloudinary(file, `submissions/${profile.id}/${assignmentId}`)
        );

        const uploadResults = await Promise.all(uploadPromises);

        const filesData = uploadResults.map((result, index) => ({
          file_url: result.secure_url,
          file_name: files[index].name
        }));

        await addDoc(collection(db, 'submissions'), {
          assignment_id: assignmentId,
          student_id: profile.id,
          files: filesData,
          status: 'submitted',
          submitted_at: serverTimestamp(),
        });
      }

      // Data will be automatically updated via realtime listeners
    } catch (error) {
      console.error('Error uploading submission:', error);
      if (error instanceof Error && error.message.includes('Cloudinary')) {
        alert('Lỗi upload file lên Cloudinary. Vui lòng thử lại.');
      } else {
        alert('Lỗi khi nộp bài. Vui lòng thử lại.');
      }
    } finally {
      setUploading(null);
    }
  };

  const getStatusIcon = (assignment: AssignmentStudent & { assignment?: Assignment; submission?: Submission }) => {
    if (assignment.submission) {
      switch (assignment.submission.status) {
        case 'submitted':
          return <CheckCircle className="w-5 h-5 text-green-500" />;
        case 'graded':
          return <CheckCircle className="w-5 h-5 text-blue-500" />;
        default:
          return <Clock className="w-5 h-5 text-yellow-500" />;
      }
    }

    const dueDate = assignment.assignment?.due_date;
    if (dueDate && new Date(dueDate) < new Date()) {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    }

    return <Clock className="w-5 h-5 text-yellow-500" />;
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

    const dueDate = assignment.assignment?.due_date;
    if (dueDate && new Date(dueDate) < new Date()) {
      return 'Quá hạn';
    }

    return 'Chưa nộp';
  };

  if (loading) {
    return (
      <div className="bg-gray-100 p-6">
        <SkeletonList count={6} />
      </div>
    );
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
                    {getStatusIcon(assignment)}
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">
                        {assignment.assignment?.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Trạng thái:</span>
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${assignment.submission?.status === 'graded'
                          ? 'bg-green-100 text-green-800'
                          : assignment.submission?.status === 'submitted'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                          }`}>
                          {getStatusText(assignment)}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Nội dung chính */}
                <div className="space-y-3">

                  {/* Thông tin thời gian */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <div>
                        <p className="text-xs font-medium text-blue-900">Ngày giao</p>
                        <p className="text-sm text-blue-700">
                          {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString('vi-VN') : 'Không xác định'}
                        </p>
                      </div>
                    </div>

                    {assignment.assignment?.due_date && (
                      <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
                        <Clock className="w-4 h-4 text-orange-600" />
                        <div>
                          <p className="text-xs font-medium text-orange-900">Hạn nộp</p>
                          <p className="text-sm text-orange-700">
                            {new Date(assignment.assignment.due_date).toLocaleString('vi-VN')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Nhận xét mới nhất từ giáo viên */}
                  {assignment.submission?.feedback && (
                    <div className="bg-blue-50 rounded-lg p-3 border-l-4 border-blue-400">
                      <h4 className="text-xs font-semibold text-blue-900 mb-1">Nhận xét mới nhất:</h4>
                      <p className="text-sm text-gray-800 line-clamp-2">
                        {assignment.submission.feedback}
                      </p>
                    </div>
                  )}
                </div>

                {/* Nút nộp bài */}
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex justify-center">
                    {!assignment.submission && (
                      <label
                        className={`modern-btn modern-btn-success cursor-pointer ${uploading === assignment.assignment_id ? 'opacity-50' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Upload className="w-4 h-4" />
                        {uploading === assignment.assignment_id ? 'Đang tải...' : 'Nộp bài'}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length > 0) {
                              handleFileUpload(assignment.assignment_id, files);
                            }
                          }}
                          disabled={uploading === assignment.assignment_id}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal chi tiết bài tập */}
      {selectedAssignment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header modal */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {getStatusIcon(selectedAssignment)}
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
                <button
                  onClick={() => setSelectedAssignment(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Nội dung modal */}
              <div className="space-y-6">
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
                        {selectedAssignment.assigned_at ? new Date(selectedAssignment.assigned_at).toLocaleDateString('vi-VN') : 'Không xác định'}
                      </p>
                    </div>
                  </div>

                  {selectedAssignment.assignment?.due_date && (
                    <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg">
                      <Clock className="w-6 h-6 text-orange-600" />
                      <div>
                        <p className="text-sm font-medium text-orange-900">Hạn nộp</p>
                        <p className="text-lg text-orange-700">
                          {new Date(selectedAssignment.assignment.due_date).toLocaleString('vi-VN')}
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
                        {selectedAssignment.assignment.files.map((file, index) => (
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
                        {selectedAssignment.submission.files.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-200">
                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-green-500" />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{file.file_name}</p>
                                {index === 0 && (
                                  <p className="text-xs text-gray-600">
                                    Nộp lúc: {new Date(selectedAssignment.submission!.submitted_at).toLocaleString('vi-VN')}
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
                            <p className="text-xs text-gray-600">
                              Nộp lúc: {new Date(selectedAssignment.submission.submitted_at).toLocaleString('vi-VN')}
                            </p>
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
                    {selectedAssignment.submission?.feedback || 'Giáo viên chưa có nhận xét cho bài tập này.'}
                  </p>
                </div>

                {/* Nút nộp bài trong modal */}
                {!selectedAssignment.submission && (
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                    <h3 className="text-lg font-semibold text-yellow-900 mb-3">Nộp bài</h3>
                    <label className={`modern-btn modern-btn-success cursor-pointer inline-flex items-center gap-2 ${uploading === selectedAssignment.assignment_id ? 'opacity-50' : ''}`}>
                      <Upload className="w-4 h-4" />
                      {uploading === selectedAssignment.assignment_id ? 'Đang tải...' : 'Chọn file để nộp bài'}
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            handleFileUpload(selectedAssignment.assignment_id, files);
                          }
                        }}
                        disabled={uploading === selectedAssignment.assignment_id}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}