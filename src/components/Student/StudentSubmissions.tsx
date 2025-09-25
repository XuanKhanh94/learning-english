import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Submission, Assignment, Comment, Profile } from '../../lib/firebase';
import { FileText, Upload, MessageSquare, User, Send, Download, X, Edit, FileCheck, FileDown } from 'lucide-react';
import { SkeletonList } from '../Skeletons';

export function StudentSubmissions() {
  const { profile } = useAuth();
  const [submissions, setSubmissions] = useState<(Submission & { assignment?: Assignment })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [key: string]: Comment[] }>({});
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [viewedSubmissions, setViewedSubmissions] = useState<Set<string>>(new Set());
  const commentsEndRef = useRef<HTMLDivElement>(null);

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

      // Filter out submissions without valid assignments and test assignments
      const validSubmissions = submissionsWithDetails.filter(sub => {
        if (sub.assignment === undefined) return false;

        // Filter out test assignments
        const title = sub.assignment.title?.toLowerCase() || '';
        const description = sub.assignment.description?.toLowerCase() || '';
        const isTestAssignment = title.includes('test') || description.includes('test');

        // Log for debugging
        if (isTestAssignment) {
          console.log('Filtering out test submission:', {
            title: sub.assignment.title,
            description: sub.assignment.description,
            assignmentId: sub.assignment_id
          });
        }

        return !isTestAssignment;
      });

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


  // Auto-open the submission with comment from notifications
  useEffect(() => {
    const id = localStorage.getItem('focus_submission_id');
    if (id) {
      // Wait a bit for submissions to load, then check if submission exists
      const timer = setTimeout(() => {
        const submissionExists = submissions.some(s => s.id === id);

        if (submissionExists) {
          setSelectedSubmission(id);
          // Mark this submission as viewed
          setViewedSubmissions(prev => new Set([...prev, id]));
          localStorage.removeItem('focus_submission_id');
        } else {
          // If submission not found, try again after a longer delay
          setTimeout(() => {
            const submissionExistsRetry = submissions.some(s => s.id === id);

            if (submissionExistsRetry) {
              setSelectedSubmission(id);
              // Mark this submission as viewed
              setViewedSubmissions(prev => new Set([...prev, id]));
            }
            localStorage.removeItem('focus_submission_id');
          }, 1000);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [submissions]);

  // Realtime listener for comments
  useEffect(() => {
    if (!profile || submissions.length === 0) return;

    const submissionIds = submissions.map(s => s.id);
    const unsubscribeFunctions: (() => void)[] = [];

    console.log('Setting up comments listeners for submissions:', submissionIds);

    // Setup realtime listeners for each submission's comments
    submissionIds.forEach(submissionId => {
      const commentsQuery = query(
        collection(db, 'comments'),
        where('submission_id', '==', submissionId)
      );

      const unsubscribe = onSnapshot(commentsQuery, async (snapshot) => {
        console.log(`Comments listener triggered for submission ${submissionId}:`, snapshot.docs.length, 'comments');
        try {
          const commentsData = await Promise.all(
            snapshot.docs.map(async (commentDoc) => {
              try {
                const commentData = { id: commentDoc.id, ...commentDoc.data() } as Comment;
                console.log('Processing comment:', commentData);

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

          // Sort by created_at (oldest first, newest last)
          validComments.sort((a, b) => {
            const dateA = toDate(a.created_at as unknown);
            const dateB = toDate(b.created_at as unknown);
            return dateA.getTime() - dateB.getTime();
          });

          console.log(`Setting comments for ${submissionId}:`, validComments);
          setComments(prev => {
            const newComments = {
              ...prev,
              [submissionId]: validComments
            };
            console.log('Updated comments state:', newComments);
            return newComments;
          });
        } catch (error) {
          console.error('Error processing comments:', error);
        }
      }, (error) => {
        console.error('Error in comments listener:', error);
      });

      unsubscribeFunctions.push(unsubscribe);
    });

    // Cleanup function
    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, [profile, submissions]);

  // Auto-scroll to bottom when new comments are added
  useEffect(() => {
    if (selectedSubmission && comments[selectedSubmission] && comments[selectedSubmission].length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedSubmission, comments]);

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
      // Comments will be automatically updated via realtime listener
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
    <div className="modern-bg-primary min-h-screen flex flex-col">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="modern-card-header p-6 sm:p-8 modern-animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg">
                  <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div>
                  <h1 className="modern-heading-2">Bài đã nộp</h1>
                  <p className="modern-text-muted mt-2">Xem lại các bài tập đã nộp và kết quả chấm điểm</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

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
              <div key={submission.id} className="assignment-card-static p-4 sm:p-6 modern-animate-fade-in-scale h-full flex flex-col">
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
                        ? 'status-graded'
                        : 'status-pending'
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
                        <span className="text-xs modern-badge-accent px-2 py-1 rounded-full">
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
                              className="btn-download text-xs px-3 py-1"
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
                </div>

                {/* Nút tải xuống và xem thảo luận - luôn nằm ở cuối */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="flex flex-row sm:flex-col gap-2 sm:gap-4">
                    <button
                      onClick={() => handleDownload(submission.file_url, submission.file_name)}
                      className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300 min-w-[120px]"
                    >
                      <Download className="w-4 h-4" />
                      <span className="font-medium">Tải xuống</span>
                    </button>

                    <button
                      onClick={() => {
                        const newSelected = selectedSubmission === submission.id ? null : submission.id;
                        console.log('Discussion button clicked:', {
                          submissionId: submission.id,
                          newSelected,
                          currentSelected: selectedSubmission
                        });
                        setSelectedSubmission(newSelected);
                        if (newSelected) {
                          // Mark this submission as viewed
                          setViewedSubmissions(prev => {
                            const newSet = new Set([...prev, newSelected]);
                            console.log('Updated viewedSubmissions:', Array.from(newSet));
                            return newSet;
                          });
                        }
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-green-200 hover:border-green-300 min-w-[120px]"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span className="font-medium">
                        {selectedSubmission === submission.id ? 'Ẩn thảo luận' : 'Xem thảo luận'}
                      </span>
                      {(() => {
                        const hasViewed = viewedSubmissions.has(submission.id);
                        const hasComments = comments[submission.id] && comments[submission.id].length > 0;
                        const commentCount = comments[submission.id]?.length || 0;

                        console.log(`Badge check for ${submission.id}:`, {
                          hasViewed,
                          hasComments,
                          commentCount,
                          viewedSubmissions: Array.from(viewedSubmissions),
                          comments: comments[submission.id]
                        });

                        return hasComments && (
                          <span className="bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold ml-1">
                            {commentCount}
                          </span>
                        );
                      })()}
                    </button>
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
              <div className="modern-card rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="p-6 border-b flex-shrink-0">
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
                  <div className="space-y-4">
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
                              ? 'modern-badge-primary'
                              : 'modern-badge-success'
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
                    {/* Auto-scroll target */}
                    <div ref={commentsEndRef} />
                  </div>

                </div>

                {/* Comment Input - Fixed at bottom */}
                <div className="p-6 border-t bg-gray-50 flex-shrink-0">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Nhập bình luận..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:border-blue-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-colors"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !sendingComment) {
                          handleSendComment(selectedSubmission);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleSendComment(selectedSubmission)}
                      disabled={sendingComment || !newComment.trim()}
                      className="modern-btn modern-btn-primary"
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
    </div>
  );
}