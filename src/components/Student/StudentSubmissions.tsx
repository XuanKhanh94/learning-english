import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Submission, Assignment, Comment, Profile } from '../../lib/firebase';
import { FileText, Upload, MessageSquare, User, Send, Download, X, Edit, FileCheck, Star, FileDown } from 'lucide-react';
import { SkeletonList } from '../Skeletons';

export function StudentSubmissions() {
  const { profile } = useAuth();
  const [submissions, setSubmissions] = useState<(Submission & { assignment?: Assignment })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [key: string]: Comment[] }>({});
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Safe timestamp -> Date converter
  const toDate = (ts: unknown): Date => {
    if (!ts) return new Date(0);
    try {
      if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
        return new Date((ts as { seconds: number }).seconds * 1000);
      }
      if (typeof ts === 'number') {
        return new Date(ts * 1000);
      }
      if (typeof ts === 'string') {
        return new Date(ts);
      }
      return new Date(0);
    } catch {
      return new Date(0);
    }
  };

  const fetchSubmissions = useCallback(async () => {
    if (!profile) return;

    try {
      // Fetch all submissions by this student
      const q = query(
        collection(db, 'submissions'),
        where('student_id', '==', profile.id)
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.docs.length === 0) {
        setSubmissions([]);
        setLoading(false);
        return;
      }

      // Fetch related assignment details and student profiles in parallel
      const submissionsWithDetails = await Promise.all(
        querySnapshot.docs.map(async (submissionDoc) => {
          const submissionData = { id: submissionDoc.id, ...submissionDoc.data() } as Submission;

          // Fetch assignment details
          const assignmentDoc = await getDoc(doc(db, 'assignments', submissionData.assignment_id));
          const assignment = assignmentDoc.exists() ?
            { id: assignmentDoc.id, ...assignmentDoc.data() } as Assignment :
            undefined;

          return { ...submissionData, assignment };
        })
      );

      // Filter out submissions without valid assignments (optional, depending on data integrity)
      const validSubmissions = submissionsWithDetails.filter(sub => sub.assignment !== undefined);

      // Sort submissions by submitted_at date, newest first
      validSubmissions.sort((a, b) => {
        const dateA = toDate(a.submitted_at as unknown);
        const dateB = toDate(b.submitted_at as unknown);
        return dateB.getTime() - dateA.getTime();
      });

      setSubmissions(validSubmissions);
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
          try {
            const commentData = { id: commentDoc.id, ...commentDoc.data() } as Comment;

            // Fetch user details
            const userDoc = await getDoc(doc(db, 'profiles', commentData.user_id));
            const user = userDoc.exists() ?
              { id: userDoc.id, ...userDoc.data() } as Profile :
              null;

            return { ...commentData, user };
          } catch (error) {
            console.error('Error processing comment:', error);
            return null;
          }
        })
      );

      // Filter out null comments
      const validComments = commentsData.filter(comment => comment !== null) as Comment[];

      // Sort by created_at
      validComments.sort((a, b) => {
        const dateA = toDate(a.created_at as unknown);
        const dateB = toDate(b.created_at as unknown);
        return dateB.getTime() - dateA.getTime();
      });

      setComments(prev => ({ ...prev, [submissionId]: validComments }));
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  }, []);

  // Auto-open the submission with comment from notifications
  useEffect(() => {
    const id = localStorage.getItem('focus_submission_id');
    if (id) {
      // Wait a bit for submissions to load, then check if submission exists
      const timer = setTimeout(() => {
        const submissionExists = submissions.some(s => s.id === id);

        if (submissionExists) {
          setSelectedSubmission(id);
          fetchComments(id);
          localStorage.removeItem('focus_submission_id');
        } else {
          // If submission not found, try again after a longer delay
          setTimeout(() => {
            const submissionExistsRetry = submissions.some(s => s.id === id);

            if (submissionExistsRetry) {
              setSelectedSubmission(id);
              fetchComments(id);
            }
            localStorage.removeItem('focus_submission_id');
          }, 1000);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [submissions, fetchComments]);


  const handleSendComment = async (submissionId: string) => {
    if (!profile || !newComment.trim()) return;

    setSendingComment(true);
    try {
      await addDoc(collection(db, 'comments'), {
        submission_id: submissionId,
        user_id: profile.id,
        content: newComment,
        created_at: serverTimestamp(),
      });
      setNewComment('');
      // Optimistically update comments or refetch
      fetchComments(submissionId);
    } catch (error) {
      console.error('Error sending comment:', error);
    } finally {
      setSendingComment(false);
    }
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
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

  if (loading) {
    return (
      <div className="bg-gray-100 p-6">
        <SkeletonList count={8} />
      </div>
    );
  }

  return (
    <div className="bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Bài đã nộp</h1>
          <p className="text-gray-600">Xem lại các bài tập đã nộp và kết quả chấm điểm</p>
        </div>

        {submissions.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Chưa có bài nộp nào</h3>
            <p className="mt-1 text-sm text-gray-500">
              Hãy hoàn thành bài tập và nộp bài để xem kết quả ở đây.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 hd-1366-grid-cols-3 gap-4 sm:gap-6">
            {submissions.map((submission) => (
              <div key={submission.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 sm:gap-3 mb-2">
                      <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                        {submission.assignment?.title || 'Bài tập không xác định'}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Trạng thái:</span>
                        <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${submission.status === 'graded'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                          }`}>
                          {submission.status === 'graded' ? 'Đã chấm' : 'Chờ chấm'}
                        </span>
                      </div>

                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Nộp:</span>
                        <span className="ml-2">
                          {submission.submitted_at
                            ? toDate(submission.submitted_at as unknown).toLocaleString('vi-VN')
                            : 'Không xác định'}
                        </span>
                      </div>

                      {submission.status === 'graded' && (
                        <>
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Điểm:</span>
                            <span className="ml-2 font-semibold text-blue-600">
                              {submission.grade}/10
                            </span>
                          </div>

                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Chấm:</span>
                            <span className="ml-2">
                              {submission.graded_at
                                ? toDate(submission.graded_at as unknown).toLocaleString('vi-VN')
                                : 'Không xác định'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {submission.feedback && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <span className="font-medium">Nhận xét:</span> {submission.feedback}
                        </p>
                      </div>
                    )}

                    {submission.teacher_feedback && (
                      <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Edit className="w-4 h-4 text-green-600" />
                          <span className="font-medium text-green-800">Feedback chi tiết từ giáo viên</span>
                        </div>
                        <p className="text-sm text-green-700 whitespace-pre-wrap">
                          {submission.teacher_feedback}
                        </p>
                      </div>
                    )}

                    {submission.corrected_content && (
                      <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <FileCheck className="w-4 h-4 text-yellow-600" />
                          <span className="font-medium text-yellow-800">Bài làm đã được sửa</span>
                        </div>
                        <div className="text-sm text-yellow-700 whitespace-pre-wrap bg-white p-3 rounded border">
                          {submission.corrected_content}
                        </div>
                        <p className="text-xs text-yellow-600 mt-2">
                          💡 Tham khảo nội dung này để biết cách làm đúng
                        </p>
                      </div>
                    )}

                    {submission.returned_files && submission.returned_files.length > 0 && (
                      <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <FileDown className="w-4 h-4 text-purple-600" />
                          <span className="font-medium text-purple-800">Bài tập đã được trả</span>
                          <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                            {submission.returned_files.length} file
                          </span>
                        </div>
                        <div className="space-y-2">
                          {submission.returned_files.map((file, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-200">
                              <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4 text-purple-500" />
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{file.file_name}</p>
                                  {file.description && (
                                    <p className="text-xs text-gray-600">{file.description}</p>
                                  )}
                                  <p className="text-xs text-gray-500">
                                    Upload: {toDate(file.uploaded_at as unknown).toLocaleString('vi-VN')}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDownload(file.file_url, file.file_name)}
                                className="flex items-center gap-1 px-3 py-1 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-lg transition-colors"
                              >
                                <Download className="w-3 h-3" />
                                Tải xuống
                              </button>
                            </div>
                          ))}
                        </div>
                        {submission.returned_at && (
                          <p className="text-xs text-purple-600 mt-2">
                            📅 Trả bài lúc: {toDate(submission.returned_at as unknown).toLocaleString('vi-VN')}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-row sm:flex-col gap-2 sm:gap-4">
                      <button
                        onClick={() => handleDownload(submission.file_url, submission.file_name)}
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <Download className="w-4 h-4" />
                        Tải xuống
                      </button>

                      <button
                        onClick={() => {
                          const newSelected = selectedSubmission === submission.id ? null : submission.id;
                          setSelectedSubmission(newSelected);
                          if (newSelected) {
                            fetchComments(newSelected);
                          }
                        }}
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <MessageSquare className="w-4 h-4" />
                        {selectedSubmission === submission.id ? 'Ẩn thảo luận' : 'Xem thảo luận'}
                        {comments[submission.id] && comments[submission.id].length > 0 && (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                            {comments[submission.id].length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comments Modal */}
        {selectedSubmission && (() => {
          const submission = submissions.find(s => s.id === selectedSubmission);
          return submission ? (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]"
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
            >
              <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="p-6 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Thảo luận bài tập
                      </h3>
                      <div className="mt-2 text-sm text-gray-600">
                        <p className="font-medium">
                          {submission.assignment?.title || 'Bài tập không xác định'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Nộp:{' '}
                          {submission.submitted_at
                            ? toDate(submission.submitted_at as unknown).toLocaleString('vi-VN')
                            : 'Không xác định'}
                          {submission.grade !== undefined && (
                            <>
                              {' '}| Điểm: {submission.grade}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedSubmission(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide p-6">
                  {/* Comments List */}
                  <div className="space-y-4 mb-6">
                    {comments[selectedSubmission]?.map((comment) => (
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
                    {(!comments[selectedSubmission] || comments[selectedSubmission].length === 0) && (
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
                      placeholder="Nhập bình luận..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !sendingComment) {
                          handleSendComment(selectedSubmission);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleSendComment(selectedSubmission)}
                      disabled={sendingComment || !newComment.trim()}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-red-500 text-center py-4">
              Không tìm thấy submission với ID: {selectedSubmission}
            </div>
          );
        })()}
      </div>
    </div>
  );
}