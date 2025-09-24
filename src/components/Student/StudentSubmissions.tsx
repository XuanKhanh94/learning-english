import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, Submission, Assignment, Comment } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Download, Calendar, FileText, CheckCircle, Clock, Star, MessageSquare, Send, User } from 'lucide-react';

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

  useEffect(() => {
    if (profile) {
      fetchSubmissions();
    }
  }, [profile]);

  useEffect(() => {
    if (selectedSubmission) {
      fetchComments(selectedSubmission);
    }
  }, [selectedSubmission]);

  const fetchSubmissions = async () => {
    if (!profile) return;

    ('🔍 [StudentSubmissions] Fetching submissions for student:', profile.id, profile.email);

    try {
      // Fetch all submissions by this student
      const q = query(
        collection(db, 'submissions'),
        where('student_id', '==', profile.id)
      );

      ('📋 [StudentSubmissions] Executing query...');
      const querySnapshot = await getDocs(q);

      ('📋 [StudentSubmissions] Found submissions:', querySnapshot.docs.length);

      if (querySnapshot.docs.length === 0) {
        ('❌ [StudentSubmissions] No submissions found for student:', profile.id);
        setSubmissions([]);
        setLoading(false);
        return;
      }

      const submissionsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Submission[];

      ('📝 [StudentSubmissions] Submissions data:', submissionsData);

      // Fetch assignment details for each submission
      const enrichedSubmissions = await Promise.all(
        submissionsData.map(async (submission) => {
          ('🔍 [StudentSubmissions] Fetching assignment details for:', submission.assignment_id);

          // Fetch assignment details
          try {
            const assignmentDoc = await getDoc(doc(db, 'assignments', submission.assignment_id));
            const assignment = assignmentDoc.exists() ?
              { id: assignmentDoc.id, ...assignmentDoc.data() } as Assignment :
              null;

            if (!assignment) {
              ('❌ [StudentSubmissions] Assignment not found:', submission.assignment_id);
            } else {
              ('✅ [StudentSubmissions] Assignment found:', assignment.title);
            }

            return {
              ...submission,
              assignment
            };
          } catch (error) {
            console.error('❌ [StudentSubmissions] Error fetching assignment:', submission.assignment_id, error);
            return {
              ...submission,
              assignment: null
            };
          }
        })
      );

      // Filter out submissions where assignment data couldn't be fetched
      const validSubmissions = enrichedSubmissions.filter(item => item.assignment);

      ('🔍 [StudentSubmissions] Valid submissions after filtering:', validSubmissions.length);

      // Sort by submitted_at date (newest first)
      validSubmissions.sort((a, b) => {
        const dateA = toDate(a.submitted_at as unknown);
        const dateB = toDate(b.submitted_at as unknown);
        return dateB.getTime() - dateA.getTime();
      });

      ('✅ [StudentSubmissions] Final submissions loaded:', validSubmissions.length);
      setSubmissions(validSubmissions);
    } catch (error) {
      console.error('❌ [StudentSubmissions] Error fetching submissions:', error);
      console.error('❌ [StudentSubmissions] Error details:', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
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
        const dateA = toDate(a.created_at as unknown);
        const dateB = toDate(b.created_at as unknown);
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

  const getStatusIcon = (submission: Submission) => {
    switch (submission.status) {
      case 'submitted':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'graded':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = (submission: Submission) => {
    switch (submission.status) {
      case 'submitted':
        return 'Chờ chấm điểm';
      case 'graded':
        return `Đã chấm điểm (${submission.grade}/10)`;
      default:
        return 'Đang xử lý';
    }
  };

  const getStatusColor = (submission: Submission) => {
    switch (submission.status) {
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
        <h1 className="text-2xl font-bold text-gray-900">Bài đã nộp</h1>
        <p className="text-gray-600">Xem lại các bài tập đã nộp và kết quả chấm điểm</p>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Chưa có bài nộp nào</h3>
          <p className="mt-1 text-sm text-gray-500">
            Bạn chưa nộp bài tập nào.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {submissions.map((submission) => (
            <div key={submission.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(submission)}
                    <h3 className="text-lg font-semibold text-gray-900">
                      {submission.assignment?.title || 'Bài tập không xác định'}
                    </h3>
                  </div>

                  {submission.assignment?.description && (
                    <p className="text-gray-700 mb-4">
                      {submission.assignment.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Nộp: {submission.submitted_at ? toDate(submission.submitted_at as unknown).toLocaleString('vi-VN') : 'Không xác định'}
                    </span>
                    {submission.graded_at && (
                      <span className="flex items-center gap-1">
                        <Star className="w-4 h-4" />
                        Chấm: {submission.graded_at ? toDate(submission.graded_at as unknown).toLocaleString('vi-VN') : 'Không xác định'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm font-medium">Trạng thái:</span>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(submission)}`}>
                      {getStatusText(submission)}
                    </span>
                    {submission.status === 'graded' && submission.grade !== undefined && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                        Điểm: {submission.grade}/10
                      </span>
                    )}
                  </div>

                  {submission.feedback && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-4 h-4 text-blue-600" />
                        <p className="text-sm font-medium text-blue-900">Nhận xét từ giáo viên:</p>
                      </div>
                      <p className="text-sm text-blue-800">{submission.feedback}</p>
                    </div>
                  )}

                  {/* Comments Section */}
                  <div className="mt-4">
                    <button
                      onClick={() => setSelectedSubmission(
                        selectedSubmission === submission.id ? null : submission.id
                      )}
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

                    {selectedSubmission === submission.id && (
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
                            placeholder="Nhập nhận xét hoặc câu hỏi..."
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

                  {submission.assignment?.file_url && (
                    <button
                      onClick={() => downloadFile(submission.assignment.file_url!, submission.assignment.file_name!)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Tải đề bài
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}