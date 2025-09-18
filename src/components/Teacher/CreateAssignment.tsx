import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, Profile } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { Upload, Users, Calendar, FileText } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export function CreateAssignment() {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoadingStudents(true);
    setError('');
    try {
      ('Fetching students...');
      const q = query(
        collection(db, 'profiles'),
        where('role', '==', 'student')
      );
      const querySnapshot = await getDocs(q);

      const studentsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Profile[];

      // Sort students by full_name on the client side
      studentsData.sort((a, b) => a.full_name.localeCompare(b.full_name));

      ('Students fetched:', studentsData.length);
      setStudents(studentsData);
    } catch (error) {
      console.error('Error fetching students:', error);
      setError('Không thể tải danh sách học sinh. Vui lòng thử lại.');
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    setSuccess(false);
    setError('');

    try {
      // Upload file if provided
      let fileUrl = null;
      let fileName = null;

      if (file) {
        ('Uploading assignment file to Cloudinary:', file.name, 'Size:', file.size);

        const uploadResult = await uploadToCloudinary(file, `assignments/${profile.id}`);
        fileUrl = uploadResult.secure_url;
        fileName = file.name;

        ('Assignment file uploaded to Cloudinary:', fileUrl);
      }

      // Create assignment
      const assignmentData = {
        title,
        description,
        file_url: fileUrl,
        file_name: fileName,
        teacher_id: profile.id,
        due_date: dueDate || null,
        created_at: serverTimestamp(),
      };

      ('Saving assignment to Firebase Firestore:', assignmentData);
      const assignmentRef = await addDoc(collection(db, 'assignments'), assignmentData);

      // Assign to selected students
      if (selectedStudents.length > 0) {
        ('📝 Assigning to students:', selectedStudents);
        const assignmentStudents = selectedStudents.map(studentId => ({
          assignment_id: assignmentRef.id,
          student_id: studentId,
          assigned_at: serverTimestamp(),
        }));

        // Add each assignment-student relationship
        for (const assignmentStudent of assignmentStudents) {
          ('💾 Creating assignment-student relationship:', assignmentStudent);
          await addDoc(collection(db, 'assignment_students'), assignmentStudent);
        }
        ('Assignment-student relationships saved to Firestore');
      } else {
        ('⚠️ No students selected for assignment');
      }

      setSuccess(true);
      // Reset form
      setTitle('');
      setDescription('');
      setDueDate('');
      setFile(null);
      setSelectedStudents([]);
    } catch (error) {
      console.error('Error creating assignment:', error);
      if (error instanceof Error && error.message.includes('Cloudinary')) {
        setError('Lỗi upload file lên Cloudinary. Vui lòng kiểm tra cấu hình Cloudinary.');
      } else {
        setError(error instanceof Error ? error.message : 'Có lỗi xảy ra khi tạo bài tập');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tạo bài tập mới</h1>
        <p className="text-gray-600">Tạo bài tập và gán cho học sinh</p>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700">Bài tập đã được tạo thành công!</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Thông tin bài tập
          </h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Tiêu đề bài tập *
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nhập tiêu đề bài tập"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Mô tả
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Mô tả chi tiết về bài tập..."
              />
            </div>

            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Hạn nộp
              </label>
              <input
                type="datetime-local"
                id="dueDate"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">
                <Upload className="w-4 h-4 inline mr-1" />
                Tệp đính kèm
              </label>
              <input
                type="file"
                id="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                accept=".pdf,.doc,.docx,.txt,.zip,.jpg,.jpeg,.png,.gif,.mp4,.mov"
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  Đã chọn: {file.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Student Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Gán cho học sinh
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
              <button
                onClick={fetchStudents}
                className="ml-2 underline hover:no-underline"
              >
                Thử lại
              </button>
            </div>
          )}

          {loadingStudents ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600">Đang tải danh sách học sinh...</span>
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Chưa có học sinh nào</h3>
              <p className="mt-1 text-sm text-gray-500">
                Chưa có học sinh nào trong hệ thống.
              </p>
              <button
                onClick={fetchStudents}
                className="mt-2 text-blue-600 hover:text-blue-700 text-sm underline"
              >
                Tải lại
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {students.map((student) => (
                <label key={student.id} className="flex items-center p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStudents.includes(student.id)}
                    onChange={() => handleStudentToggle(student.id)}
                    className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{student.full_name}</p>
                    <p className="text-sm text-gray-500">{student.email}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {selectedStudents.length > 0 && (
            <p className="mt-3 text-sm text-blue-600">
              Đã chọn {selectedStudents.length} học sinh
            </p>
          )}
        </div>

        <div className="flex justify-end gap-4">
          <button
            type="button"
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors"
          >
            {loading ? 'Đang tạo...' : 'Tạo bài tập'}
          </button>
        </div>
      </form>
    </div>
  );
}