import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, orderBy, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db, Assignment, AssignmentStudent, Submission } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { useAuth } from '../../hooks/useAuth';
import { Download, Upload, Clock, CheckCircle, AlertCircle, Calendar, FileText } from 'lucide-react';
import { SkeletonList } from '../Skeletons';

export function StudentAssignments() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<(AssignmentStudent & { assignment?: Assignment; submission?: Submission })[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      fetchAssignments();
    }
  }, [profile]);

  const fetchAssignments = async () => {
    if (!profile) return;


    try {
      // Fetch assignments assigned to this student
      const q = query(
        collection(db, 'assignment_students'),
        where('student_id', '==', profile.id),
      );
      const querySnapshot = await getDocs(q);


      const assignmentStudents = querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Convert assigned_at Timestamp to Date
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

      // Fetch assignment details and submissions
      const enrichedAssignments = await Promise.all(
        assignmentStudents.map(async (assignmentStudent) => {

          // Fetch assignment details
          const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentStudent.assignment_id));
          const assignment = assignmentDoc.exists() ?
            {
              id: assignmentDoc.id,
              ...assignmentDoc.data(),
              // Convert due_date Timestamp to Date
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
              // Convert submitted_at Timestamp to Date
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
      console.error('Error fetching assignments:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
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

  const handleFileUpload = async (assignmentId: string, file: File) => {
    if (!profile) return;

    setUploading(assignmentId);

    try {
      // Upload file to Cloudinary
      const uploadResult = await uploadToCloudinary(file, `submissions/${profile.id}/${assignmentId}`);

      // Create submission record in Firebase Firestore
      await addDoc(collection(db, 'submissions'), {
        assignment_id: assignmentId,
        student_id: profile.id,
        file_url: uploadResult.secure_url,
        file_name: file.name,
        status: 'submitted',
        submitted_at: serverTimestamp(),
      });

      // Refresh assignments
      await fetchAssignments();
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
      <div className="min-h-screen bg-gray-100 p-6">
        <SkeletonList count={6} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bài tập của tôi</h1>
        <p className="text-gray-600">Quản lý và nộp bài tập được giao</p>
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
        <div className="grid gap-6">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(assignment)}
                    <h3 className="text-lg font-semibold text-gray-900">
                      {assignment.assignment?.title}
                    </h3>
                  </div>

                  {assignment.assignment?.description && (
                    <p className="text-gray-700 mb-4">
                      {assignment.assignment.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Giao: {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString('vi-VN') : 'Không xác định'}
                    </span>
                    {assignment.assignment?.due_date && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Hạn nộp: {new Date(assignment.assignment.due_date).toLocaleString('vi-VN')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm font-medium">Trạng thái:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${assignment.submission?.status === 'graded'
                      ? 'bg-blue-100 text-blue-800'
                      : assignment.submission?.status === 'submitted'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                      }`}>
                      {getStatusText(assignment)}
                    </span>
                  </div>

                  {assignment.submission?.feedback && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm font-medium text-blue-900">Nhận xét từ giáo viên:</p>
                      <p className="text-sm text-blue-800 mt-1">{assignment.submission.feedback}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  {assignment.assignment?.file_url && (
                    <button
                      onClick={() => downloadFile(assignment.assignment!.file_url!, assignment.assignment!.file_name!)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Tải đề bài
                    </button>
                  )}

                  {!assignment.submission && (
                    <label className={`flex items-center gap-2 px-3 py-2 text-sm text-white bg-green-500 hover:bg-green-600 rounded-lg cursor-pointer transition-colors ${uploading === assignment.assignment_id ? 'opacity-50' : ''
                      }`}>
                      <Upload className="w-4 h-4" />
                      {uploading === assignment.assignment_id ? 'Đang tải...' : 'Nộp bài'}
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleFileUpload(assignment.assignment_id, file);
                          }
                        }}
                        disabled={uploading === assignment.assignment_id}
                      />
                    </label>
                  )}

                  {assignment.submission && (
                    <button
                      onClick={() => downloadFile(assignment.submission!.file_url, assignment.submission!.file_name)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Tải bài nộp
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