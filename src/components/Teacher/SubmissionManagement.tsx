import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, Submission, Assignment, Profile, Comment } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Download, Eye, Star, MessageSquare, Calendar, User, FileText, CheckCircle, Clock, AlertCircle, Send } from 'lucide-react';

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
  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [updating, setUpdating] = useState(false);
  const [selectedSubmissionForComments, setSelectedSubmissionForComments] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [key: string]: Comment[] }>({});
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'graded'>(showOnlyPending ? 'pending' : 'all');

  useEffect(() => {
    if (profile) {
      fetchSubmissions();
    }
  }, [profile]);

  useEffect(() => {
    if (selectedSubmissionForComments) {
      fetchComments(selectedSubmissionForComments);
    }
  }, [selectedSubmissionForComments]);

  useEffect(() => {
    applyFilter();
  }, [submissions, filterMode]);

  useEffect(() => {
    setFilterMode(showOnlyPending ? 'pending' : 'all');
  }, [showOnlyPending]);

  const fetchSubmissions = async () => {
    if (!profile) return;

    try {
      ('🔍 Fetching submissions for teacher:', profile.id);

      // First, get all assignments created by this teacher
      const assignmentsQuery = query(
        collection(db, 'assignments'),
        where('teacher_id', '==', profile.id)
      );
      const assignmentsSnapshot = await getDocs(assignmentsQuery);
      const teacherAssignmentIds = assignmentsSnapshot.docs.map(doc => doc.id);

      ('📋 Teacher assignments found:', teacherAssignmentIds.length);

      if (teacherAssignmentIds.length === 0) {
        setSubmissions([]);
        return;
      }

      // Get all submissions for these assignments
      const allSubmissions: (Submission & { assignment?: Assignment; student?: Profile })[] = [];

      for (const assignmentId of teacherAssignmentIds) {
        const submissionsQuery = query(
          collection(db, 'submissions'),
          where('assignment_id', '==', assignmentId)
        );
        const submissionsSnapshot = await getDocs(submissionsQuery);

        for (const submissionDoc of submissionsSnapshot.docs) {
          const submissionData = { id: submissionDoc.id, ...submissionDoc.data() } as Submission;

          // Fetch assignment details
          const assignmentDoc = await getDoc(doc(db, 'assignments', submissionData.assignment_id));
          const assignment = assignmentDoc.exists() ?
            { id: assignmentDoc.id, ...assignmentDoc.data() } as Assignment :
            null;

          // Fetch student details
          const studentDoc = await getDoc(doc(db, 'profiles', submissionData.student_id));
          const student = studentDoc.exists() ?
            { id: studentDoc.id, ...studentDoc.data() } as Profile :
            null;

          allSubmissions.push({
            ...submissionData,
            assignment,
            student
          });
        }
      }

      // Sort by submitted_at date (newest first)
      allSubmissions.sort((a, b) => {
        const dateA = new Date(a.submitted_at);
        const dateB = new Date(b.submitted_at);
        return dateB.getTime() - dateA.getTime();
      });

      ('✅ Submissions loaded:', allSubmissions.length);
      setSubmissions(allSubmissions);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = () => {
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
  };

  const fetchComments = async (submissionId: string) => {
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
        const dateA = a.created_at?.seconds ? new Date(a.created_at.seconds * 1000) : new Date(a.created_at);
        const dateB = b.created_at?.seconds ? new Date(b.created_at.seconds * 1000) : new Date(b.created_at);
        return dateB.getTime() - dateA.getTime();
      });

      setComments(prev => ({ ...prev, [submissionId]: commentsData }));
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

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
    setShowGradeModal(true);
  };

  const closeGradeModal = () => {
    setSelectedSubmission(null);
    setGrade('');
    setFeedback('');
    setShowGradeModal(false);
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
          ? { ...sub, grade: gradeNumber, feedback: feedback.trim(), status: 'graded' as const, graded_at: new Date().toISOString() }
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {showOnlyPending ? 'Bài nộp chờ chấm' : 'Quản lý bài nộp'}
        </h1>
        <p className="text-gray-600">
          {showOnlyPending ? 'Danh sách bài nộp đang chờ chấm điểm' : 'Xem và chấm điểm bài nộp của học sinh'}
        </p>
      </div>

      {/* Filter Buttons */}
      {!showOnlyPending && (
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterMode === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            Tất cả ({submissions.length})
          </button>
          <button
            onClick={() => setFilterMode('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterMode === 'pending'
                ? 'bg-yellow-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            Chờ chấm ({submissions.filter(sub => sub.status === 'submitted').length})
          </button>
          <button
            onClick={() => setFilterMode('graded')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterMode === 'graded'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
          {filteredSubmissions.map((submission) => (
            <div key={submission.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(submission.status)}
                    <h3 className="text-lg font-semibold text-gray-900">
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
                      Nộp: {new Date(submission.submitted_at).toLocaleString('vi-VN')}
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
                      onClick={() => setSelectedSubmissionForComments(
                        selectedSubmissionForComments === submission.id ? null : submission.id
                      )}
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

                    {selectedSubmissionForComments === submission.id && (
                      <div className="mt-3 border-t pt-3">
                        {/* Comments List */}
                        <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                          {comments[submission.id]?.map((comment) => (
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
                          {(!comments[submission.id] || comments[submission.id].length === 0) && (
                            <p className="text-sm text-gray-500 text-center py-4">
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
                                handleSendComment(submission.id);
                              }
                            }}
                          />
                          <button
                            onClick={() => handleSendComment(submission.id)}
                            disabled={sendingComment || !newComment.trim()}
                            className="px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grade Modal */}
      {showGradeModal && selectedSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
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
    </div>
  );
}