import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, getDoc, addDoc, serverTimestamp, getCountFromServer, documentId } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, Submission, Assignment, Profile, Comment, ReturnedFile } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Download, Star, MessageSquare, Calendar, User, FileText, CheckCircle, Clock, AlertCircle, Send, Edit, FileCheck, Upload, X, Plus } from 'lucide-react';
import { VirtualList } from '../VirtualList';
import { SkeletonList } from '../Skeletons';


interface SubmissionManagementProps {
  showOnlyPending?: boolean;
}

export function SubmissionManagement({ showOnlyPending = false }: SubmissionManagementProps) {
  const { profile } = useAuth();
  const [submissions, setSubmissions] = useState<(Submission & { assignment?: Assignment; student?: Profile })[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<(Submission & { assignment?: Assignment; student?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [correctedContent, setCorrectedContent] = useState('');
  const [returnedFiles, setReturnedFiles] = useState<File[]>([]);
  const [fileDescriptions, setFileDescriptions] = useState<{ [key: string]: string }>({});
  const [uploading, setUploading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedSubmissionForComments, setSelectedSubmissionForComments] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [key: string]: Comment[] }>({});
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'graded'>(showOnlyPending ? 'pending' : 'all');
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  // Safe timestamp to Date converter
  const toDate = (ts: unknown): Date => {
    if (!ts) return new Date(0);
    try {
      if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
        return (ts as { toDate: () => Date }).toDate();
      }
      if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
        return new Date((ts as { seconds: number }).seconds * 1000);
      }
      return new Date(ts as string | number | Date);
    } catch {
      return new Date(0);
    }
  };

  // Typed idle scheduler to avoid 'any'
  const scheduleIdle = (cb: () => void) => {
    const win = window as Window & { requestIdleCallback?: (cb: IdleRequestCallback) => number };
    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(() => cb());
    } else {
      setTimeout(cb, 0);
    }
  };

  const fetchSubmissions = useCallback(async () => {
    if (!profile) return;

    try {
      // Get all assignments created by this teacher
      const assignmentsQuery = query(collection(db, 'assignments'), where('teacher_id', '==', profile.id));
      const assignmentsSnapshot = await getDocs(assignmentsQuery);
      const teacherAssignmentIds = assignmentsSnapshot.docs.map(doc => doc.id);

      // Build assignment map to avoid refetch per submission
      const assignmentMap: Record<string, Assignment> = {};
      assignmentsSnapshot.docs.forEach(d => {
        assignmentMap[d.id] = { id: d.id, ...(d.data() as Record<string, unknown>) } as Assignment;
      });

      if (teacherAssignmentIds.length === 0) {
        setSubmissions([]);
        setCommentCounts({});
        return;
      }

      // Fetch all submissions in parallel per assignment (reduce round trips)
      const submissionSnapshots = await Promise.all(
        teacherAssignmentIds.map(assignmentId =>
          getDocs(query(collection(db, 'submissions'), where('assignment_id', '==', assignmentId)))
        )
      );

      const rawSubmissions: Submission[] = [];
      const studentIds = new Set<string>();
      submissionSnapshots.forEach(snapshot => {
        snapshot.docs.forEach(subDoc => {
          const subData = { id: subDoc.id, ...subDoc.data() } as Submission;
          rawSubmissions.push(subData);
          studentIds.add(subData.student_id);
        });
      });

      // Batch fetch student profiles using documentId() in chunks of 10
      const studentIdArray = Array.from(studentIds);
      const chunkSize = 10;
      const studentChunks: string[][] = [];
      for (let i = 0; i < studentIdArray.length; i += chunkSize) {
        studentChunks.push(studentIdArray.slice(i, i + chunkSize));
      }

      const studentSnapshots = await Promise.all(
        studentChunks.map(chunk =>
          getDocs(query(collection(db, 'profiles'), where(documentId(), 'in', chunk)))
        )
      );
      const studentMap: Record<string, Profile> = {};
      studentSnapshots.forEach(snp => {
        snp.docs.forEach(d => {
          studentMap[d.id] = { id: d.id, ...(d.data() as Record<string, unknown>) } as Profile;
        });
      });

      // Assemble submissions with assignment and student details without N+1
      const allSubmissions: (Submission & { assignment?: Assignment; student?: Profile })[] = rawSubmissions.map(sub => ({
        ...sub,
        assignment: assignmentMap[sub.assignment_id],
        student: studentMap[sub.student_id]
      }));

      // Sort by submitted_at date (newest first)
      allSubmissions.sort((a, b) => {
        const dateA = toDate(a.submitted_at as unknown);
        const dateB = toDate(b.submitted_at as unknown);
        return dateB.getTime() - dateA.getTime();
      });

      setSubmissions(allSubmissions);

      // Defer comment counts: fetch after paint to speed initial load
      const gradedSubmissions = allSubmissions.filter(s => s.status === 'graded');
      if (gradedSubmissions.length > 0) {
        const idleCb = async () => {
          try {
            const countEntries = await Promise.all(
              gradedSubmissions.map(async (sub) => {
                try {
                  const commentsQuery = query(collection(db, 'comments'), where('submission_id', '==', sub.id));
                  const snapshot = await getCountFromServer(commentsQuery);
                  return [sub.id, snapshot.data().count as number] as const;
                } catch {
                  return [sub.id, 0] as const;
                }
              })
            );
            const counts: Record<string, number> = {};
            countEntries.forEach(([id, count]) => { counts[id] = count; });
            setCommentCounts(counts);
          } catch {
            // ignore
          }
        };
        scheduleIdle(idleCb);
      } else {
        setCommentCounts({});
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile) {
      fetchSubmissions();
    }
  }, [profile, fetchSubmissions]);

  const fetchComments = useCallback(async (submissionId: string) => {
    try {
      const q = query(
        collection(db, 'comments'),
        where('submission_id', '==', submissionId)
      );
      const querySnapshot = await getDocs(q);

      const commentsData = await Promise.all(
        querySnapshot.docs.map(async (commentDoc) => {
          const commentData = { id: commentDoc.id, ...commentDoc.data() } as Comment;

          // Fetch user details
          const userDoc = await getDoc(doc(db, 'profiles', commentData.user_id));
          const user = userDoc.exists() ?
            { id: userDoc.id, ...userDoc.data() } as Profile :
            null;

          return { ...commentData, user };
        })
      );

      // Sort by created_at
      commentsData.sort((a, b) => {
        const dateA = toDate(a.created_at);
        const dateB = toDate(b.created_at);
        return dateB.getTime() - dateA.getTime();
      });

      setComments(prev => ({ ...prev, [submissionId]: commentsData }));
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  }, []);

  // Fetch submission directly if not found in current list
  const fetchSubmissionDirectly = useCallback(async (submissionId: string) => {
    try {
      const submissionDoc = await getDoc(doc(db, 'submissions', submissionId));

      if (submissionDoc.exists()) {
        const submissionData = { id: submissionDoc.id, ...submissionDoc.data() } as Submission;

        // Check if this submission belongs to an assignment created by this teacher
        const assignmentDoc = await getDoc(doc(db, 'assignments', submissionData.assignment_id));
        if (assignmentDoc.exists()) {
          const assignmentData = { id: assignmentDoc.id, ...assignmentDoc.data() } as Assignment;

          if (assignmentData.teacher_id === profile?.id) {
            setSelectedSubmissionForComments(submissionId);
            fetchComments(submissionId);
            localStorage.removeItem('focus_submission_id');
            return;
          }
        }
      }

      localStorage.removeItem('focus_submission_id');
    } catch (error) {
      console.error('Error fetching submission directly:', error);
      localStorage.removeItem('focus_submission_id');
    }
  }, [profile?.id, fetchComments]);

  // Consume deep-link focus id from storage to auto-expand comments
  useEffect(() => {
    const id = localStorage.getItem('focus_submission_id');
    if (id) {
      // Wait a bit for submissions to load, then check if submission exists
      const timer = setTimeout(() => {
        const submissionExists = submissions.some(s => s.id === id);

        if (submissionExists) {
          setSelectedSubmissionForComments(id);
          fetchComments(id);
          localStorage.removeItem('focus_submission_id');
        } else {
          // If submission not found, try to fetch it directly
          fetchSubmissionDirectly(id);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [submissions, fetchComments, fetchSubmissionDirectly]);

  const applyFilter = useCallback(() => {
    let filtered = submissions;

    switch (filterMode) {
      case 'pending':
        filtered = submissions.filter(sub => sub.status === 'submitted');
        break;
      case 'graded':
        filtered = submissions.filter(sub => sub.status === 'graded');
        break;
      default:
        filtered = submissions;
    }

    setFilteredSubmissions(filtered);
  }, [submissions, filterMode]);

  useEffect(() => {
    applyFilter();
  }, [applyFilter]);

  useEffect(() => {
    setFilterMode(showOnlyPending ? 'pending' : 'all');
  }, [showOnlyPending]);


  const handleSendComment = async (submissionId: string) => {
    if (!profile || !newComment.trim()) return;

    setSendingComment(true);
    try {
      await addDoc(collection(db, 'comments'), {
        submission_id: submissionId,
        user_id: profile.id,
        content: newComment.trim(),
        created_at: serverTimestamp(),
      });

      setNewComment('');
      await fetchComments(submissionId);
      // Update local comment count optimistically
      setCommentCounts(prev => ({ ...prev, [submissionId]: (prev[submissionId] || 0) + 1 }));
    } catch (error) {
      console.error('Error sending comment:', error);
      alert('Lỗi khi gửi nhận xét. Vui lòng thử lại.');
    } finally {
      setSendingComment(false);
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

  const openGradeModal = (submission: Submission) => {
    setSelectedSubmission(submission);
    setGrade(submission.grade?.toString() || '');
    setFeedback(submission.feedback || '');
    setTeacherFeedback(submission.teacher_feedback || '');
    setCorrectedContent(submission.corrected_content || '');
    setShowGradeModal(true);
  };

  const openReturnModal = (submission: Submission) => {
    setSelectedSubmission(submission);
    setReturnedFiles([]);
    setFileDescriptions({});
    setShowReturnModal(true);
  };

  const closeGradeModal = () => {
    setSelectedSubmission(null);
    setGrade('');
    setFeedback('');
    setTeacherFeedback('');
    setCorrectedContent('');
    setShowGradeModal(false);
  };

  const closeReturnModal = () => {
    setSelectedSubmission(null);
    setReturnedFiles([]);
    setFileDescriptions({});
    setShowReturnModal(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setReturnedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setReturnedFiles(prev => prev.filter((_, i) => i !== index));
    const fileName = returnedFiles[index]?.name;
    if (fileName) {
      setFileDescriptions(prev => {
        const newDescriptions = { ...prev };
        delete newDescriptions[fileName];
        return newDescriptions;
      });
    }
  };

  const handleReturnSubmission = async () => {
    if (!selectedSubmission || returnedFiles.length === 0) return;

    setUploading(true);
    try {
      const uploadedFiles: ReturnedFile[] = [];

      // Upload each file
      for (const file of returnedFiles) {
        const fileName = `${selectedSubmission.id}_${Date.now()}_${file.name}`;
        const storageRef = ref(storage, `returned-files/${fileName}`);

        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        uploadedFiles.push({
          file_url: downloadURL,
          file_name: file.name,
          uploaded_at: new Date().toISOString(),
          description: fileDescriptions[file.name] || ''
        });
      }

      // Update submission with returned files
      await updateDoc(doc(db, 'submissions', selectedSubmission.id), {
        returned_files: uploadedFiles,
        returned_at: new Date().toISOString(),
      });

      // Update local state
      setSubmissions(submissions.map(sub =>
        sub.id === selectedSubmission.id
          ? {
            ...sub,
            returned_files: uploadedFiles,
            returned_at: new Date().toISOString()
          }
          : sub
      ));

      closeReturnModal();
      alert('Trả bài thành công!');
    } catch (error) {
      console.error('Error returning submission:', error);
      alert('Lỗi khi trả bài. Vui lòng thử lại.');
    } finally {
      setUploading(false);
    }
  };

  const handleGradeSubmission = async () => {
    if (!selectedSubmission) return;

    const gradeNumber = parseInt(grade);
    if (isNaN(gradeNumber) || gradeNumber < 0 || gradeNumber > 10) {
      alert('Điểm phải là số từ 0 đến 10');
      return;
    }

    setUpdating(true);

    try {
      await updateDoc(doc(db, 'submissions', selectedSubmission.id), {
        grade: gradeNumber,
        feedback: feedback.trim(),
        status: 'graded',
        graded_at: new Date(),
      });

      // Update local state
      setSubmissions(submissions.map(sub =>
        sub.id === selectedSubmission.id
          ? {
            ...sub,
            grade: gradeNumber,
            feedback: feedback.trim(),
            status: 'graded' as const,
            graded_at: new Date().toISOString()
          }
          : sub
      ));

      closeGradeModal();
    } catch (error) {
      console.error('Error grading submission:', error);
      alert('Lỗi khi chấm điểm. Vui lòng thử lại.');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'graded':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'Chờ chấm';
      case 'graded':
        return 'Đã chấm';
      default:
        return 'Không xác định';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'graded':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return <SkeletonList count={8} />;
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
                  <FileCheck className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div>
                  <h1 className="modern-heading-2">
                    {showOnlyPending ? 'Bài nộp chờ chấm' : 'Quản lý bài nộp'}
                  </h1>
                  <p className="modern-text-muted mt-2">
                    {showOnlyPending ? 'Danh sách bài nộp đang chờ chấm điểm' : 'Xem và chấm điểm bài nộp của học sinh'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Buttons */}
        {!showOnlyPending && (
          <div className="mb-6 flex gap-2">
            <button
              onClick={() => setFilterMode('all')}
              className={`modern-btn ${filterMode === 'all'
                ? 'modern-btn-primary'
                : 'modern-btn-secondary'
                }`}
            >
              Tất cả ({submissions.length})
            </button>
            <button
              onClick={() => setFilterMode('pending')}
              className={`modern-btn ${filterMode === 'pending'
                ? 'modern-btn-accent'
                : 'modern-btn-secondary'
                }`}
            >
              Chờ chấm ({submissions.filter(sub => sub.status === 'submitted').length})
            </button>
            <button
              onClick={() => setFilterMode('graded')}
              className={`modern-btn ${filterMode === 'graded'
                ? 'modern-btn-success'
                : 'modern-btn-secondary'
                }`}
            >
              Đã chấm ({submissions.filter(sub => sub.status === 'graded').length})
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              {showOnlyPending || filterMode === 'pending'
                ? 'Không có bài nộp chờ chấm'
                : filterMode === 'graded'
                  ? 'Không có bài nộp đã chấm'
                  : 'Chưa có bài nộp nào'
              }
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {showOnlyPending || filterMode === 'pending'
                ? 'Tất cả bài nộp đã được chấm điểm.'
                : filterMode === 'graded'
                  ? 'Chưa có bài nộp nào được chấm điểm.'
                  : 'Chưa có học sinh nào nộp bài tập.'
              }
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            <VirtualList
              items={filteredSubmissions}
              itemHeight={184}
              containerHeight={600}
              renderItem={(submission) => (
                <div key={submission.id} className="bg-white rounded-lg shadow-md p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        {getStatusIcon(submission.status)}
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                          {submission.assignment?.title || 'Bài tập không xác định'}
                        </h3>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {submission.student?.full_name || 'Học sinh không xác định'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Nộp: {toDate(submission.submitted_at as unknown).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-sm font-medium">Trạng thái:</span>
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(submission.status)}`}>
                          {getStatusText(submission.status)}
                        </span>
                        {submission.status === 'graded' && submission.grade !== undefined && (
                          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                            Điểm: {submission.grade}/10
                          </span>
                        )}
                        {submission.status === 'graded' && (
                          <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded">
                            Bình luận: {commentCounts[submission.id] ?? 0}
                          </span>
                        )}
                      </div>

                      {submission.feedback && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm font-medium text-gray-900">Nhận xét:</p>
                          <p className="text-sm text-gray-700 mt-1">{submission.feedback}</p>
                        </div>
                      )}

                      {/* Comments Section */}
                      <div className="mt-4">
                        <button
                          onClick={() => {
                            const newSelected = selectedSubmissionForComments === submission.id ? null : submission.id;
                            console.log('🖱️ [SubmissionManagement] Button clicked, newSelected:', newSelected);
                            console.log('🖱️ [SubmissionManagement] Current selectedSubmissionForComments:', selectedSubmissionForComments);
                            setSelectedSubmissionForComments(newSelected);
                            if (newSelected) {
                              console.log('🖱️ [SubmissionManagement] Fetching comments for:', newSelected);
                              // Always fetch fresh comments when opening
                              fetchComments(newSelected);
                            }
                          }}
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <MessageSquare className="w-4 h-4" />
                          {selectedSubmissionForComments === submission.id ? 'Ẩn thảo luận' : 'Xem thảo luận'}
                          {comments[submission.id] && comments[submission.id].length > 0 && (
                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                              {comments[submission.id].length}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-row sm:flex-col gap-2 sm:ml-4">
                      <button
                        onClick={() => downloadFile(submission.file_url, submission.file_name)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Tải bài nộp
                      </button>

                      <button
                        onClick={() => openGradeModal(submission)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      >
                        <Star className="w-4 h-4" />
                        {submission.status === 'graded' ? 'Sửa điểm' : 'Chấm điểm'}
                      </button>

                      <button
                        onClick={() => openReturnModal(submission)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        Trả bài
                      </button>
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        )}

        {/* Grade Modal */}
        {showGradeModal && selectedSubmission && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
            <div className="bg-white rounded-lg max-w-xs sm:max-w-md w-full p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Chấm điểm bài nộp
              </h3>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Bài tập:</p>
                <p className="font-medium text-gray-900">{selectedSubmission.assignment?.title}</p>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Học sinh:</p>
                <p className="font-medium text-gray-900">{selectedSubmission.student?.full_name}</p>
              </div>

              <div className="mb-4">
                <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-2">
                  Điểm (0-10) *
                </label>
                <input
                  type="number"
                  id="grade"
                  min="0"
                  max="10"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Nhập điểm từ 0 đến 10"
                  required
                />
              </div>

              <div className="mb-6">
                <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 mb-2">
                  Nhận xét
                </label>
                <textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Nhận xét về bài làm của học sinh..."
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={closeGradeModal}
                  disabled={updating}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleGradeSubmission}
                  disabled={updating || !grade.trim()}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors"
                >
                  {updating ? 'Đang lưu...' : 'Lưu điểm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Return Modal */}
        {showReturnModal && selectedSubmission && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
            <div className="bg-white rounded-lg max-w-xs sm:max-w-md md:max-w-2xl w-full max-h-[95vh] sm:max-h-[80vh] flex flex-col">
              <div className="p-4 sm:p-6 border-b">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                  Trả bài cho học sinh
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  {selectedSubmission.assignment?.title || 'Bài tập không xác định'} - {selectedSubmission.student?.full_name || 'Học sinh không xác định'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-purple-600" />
                      Upload file bài tập đã chấm
                    </div>
                  </label>

                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Plus className="w-8 h-8 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        Click để chọn file hoặc kéo thả vào đây
                      </span>
                      <span className="text-xs text-gray-500">
                        Hỗ trợ: PDF, DOC, DOCX, TXT, JPG, PNG
                      </span>
                    </label>
                  </div>
                </div>

                {returnedFiles.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      File đã chọn ({returnedFiles.length})
                    </h4>
                    <div className="space-y-3">
                      {returnedFiles.map((file, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <FileText className="w-5 h-5 text-gray-500" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{file.name}</p>
                            <p className="text-xs text-gray-500">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <input
                            type="text"
                            placeholder="Mô tả file (tùy chọn)"
                            value={fileDescriptions[file.name] || ''}
                            onChange={(e) => setFileDescriptions(prev => ({
                              ...prev,
                              [file.name]: e.target.value
                            }))}
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                          />
                          <button
                            onClick={() => removeFile(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs text-blue-600">💡</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-blue-900 mb-1">
                        Hướng dẫn trả bài
                      </h4>
                      <ul className="text-xs text-blue-700 space-y-1">
                        <li>• Upload file bài tập đã chấm với feedback chi tiết</li>
                        <li>• Có thể upload nhiều file (bài sửa, ghi chú, ví dụ...)</li>
                        <li>• Thêm mô tả cho từng file để học sinh hiểu rõ hơn</li>
                        <li>• Học sinh sẽ nhận được thông báo khi có bài trả</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 border-t bg-gray-50">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={closeReturnModal}
                    disabled={uploading}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleReturnSubmission}
                    disabled={uploading || returnedFiles.length === 0}
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Đang upload...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Trả bài ({returnedFiles.length} file)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comments Modal */}
        {selectedSubmissionForComments && (() => {
          const submission = submissions.find(s => s.id === selectedSubmissionForComments);
          return submission ? (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
              <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="p-6 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Thảo luận bài nộp
                      </h3>
                      <div className="mt-2 text-sm text-gray-600">
                        <p className="font-medium">{submission.assignment?.title || 'Bài tập không xác định'}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Học sinh: {submission.student?.full_name || 'Không xác định'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Nộp: {toDate(submission.submitted_at as unknown).toLocaleString('vi-VN')}
                        </p>
                        {submission.status === 'graded' && submission.grade !== undefined && (
                          <p className="text-xs text-blue-600 mt-1">
                            Điểm: {submission.grade}/10
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedSubmissionForComments(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide p-6">
                  {/* Comments List */}
                  <div className="space-y-4 mb-6">
                    {comments[selectedSubmissionForComments]?.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">
                              {comment.user?.full_name || 'Unknown User'}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full ${comment.user?.role === 'teacher'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                              }`}>
                              {comment.user?.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                    {(!comments[selectedSubmissionForComments] || comments[selectedSubmissionForComments].length === 0) && (
                      <p className="text-sm text-gray-500 text-center py-8">
                        Chưa có thảo luận nào. Hãy bắt đầu cuộc trò chuyện!
                      </p>
                    )}
                  </div>

                  {/* Comment Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Nhập nhận xét hoặc phản hồi..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !sendingComment) {
                          handleSendComment(selectedSubmissionForComments);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleSendComment(selectedSubmissionForComments)}
                      disabled={sendingComment || !newComment.trim()}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
}