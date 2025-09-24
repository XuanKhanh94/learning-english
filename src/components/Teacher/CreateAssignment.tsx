import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db, Profile, AssignmentFile } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { Upload, Users, Calendar, FileText, Plus, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

function CreateAssignment() {
    const { profile } = useAuth();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [assignmentFiles, setAssignmentFiles] = useState<File[]>([]);
    const [fileDescriptions, setFileDescriptions] = useState<{ [key: string]: string }>({});
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
            const q = query(
                collection(db, 'profiles'),
                where('role', '==', 'student')
            );
            const querySnapshot = await getDocs(q);

            const studentsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Profile[];

            studentsData.sort((a, b) => a.full_name.localeCompare(b.full_name));
            setStudents(studentsData);
        } catch (error) {
            console.error('Error fetching students:', error);
            setError('Không thể tải danh sách học sinh. Vui lòng thử lại.');
        } finally {
            setLoadingStudents(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setAssignmentFiles(prev => [...prev, ...files]);
    };

    const removeFile = (index: number) => {
        setAssignmentFiles(prev => prev.filter((_, i) => i !== index));
        const fileName = assignmentFiles[index]?.name;
        if (fileName) {
            setFileDescriptions(prev => {
                const newDescriptions = { ...prev };
                delete newDescriptions[fileName];
                return newDescriptions;
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;

        setLoading(true);
        setSuccess(false);
        setError('');

        try {
            let fileUrl = null;
            let fileName = null;
            const uploadedFiles: AssignmentFile[] = [];

            if (file) {
                const uploadResult = await uploadToCloudinary(file, `assignments/${profile.id}`);
                fileUrl = uploadResult.secure_url;
                fileName = file.name;
            }

            if (assignmentFiles.length > 0) {
                for (const file of assignmentFiles) {
                    const uploadResult = await uploadToCloudinary(file, `assignments/${profile.id}`);
                    uploadedFiles.push({
                        file_url: uploadResult.secure_url,
                        file_name: file.name,
                        uploaded_at: new Date().toISOString(),
                        description: fileDescriptions[file.name] || ''
                    });
                }
            }

            const assignmentData = {
                title,
                description,
                file_url: fileUrl,
                file_name: fileName,
                files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
                teacher_id: profile.id,
                due_date: dueDate || null,
                created_at: serverTimestamp(),
            };

            const assignmentRef = await addDoc(collection(db, 'assignments'), assignmentData);

            if (selectedStudents.length > 0) {
                const assignmentStudents = selectedStudents.map(studentId => ({
                    assignment_id: assignmentRef.id,
                    student_id: studentId,
                    assigned_at: serverTimestamp(),
                }));

                for (const assignmentStudent of assignmentStudents) {
                    await addDoc(collection(db, 'assignment_students'), assignmentStudent);
                }
            }

            setSuccess(true);
            setTitle('');
            setDescription('');
            setDueDate('');
            setFile(null);
            setAssignmentFiles([]);
            setFileDescriptions({});
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
        <div className="bg-gradient-to-br from-green-50 to-emerald-100">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <div className="mb-6 sm:mb-8">
                    <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className="p-2 sm:p-3 bg-green-100 rounded-xl">
                                <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Tạo bài tập mới</h1>
                                <p className="text-gray-600 mt-1 text-sm sm:text-base">Tạo bài tập và gán cho học sinh</p>
                            </div>
                        </div>
                    </div>
                </div>

                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-green-700">Bài tập đã được tạo thành công!</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                    <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
                        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
                            <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
                                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                            </div>
                            Thông tin bài tập
                        </h2>

                        <div className="space-y-4 sm:space-y-6">
                            <div>
                                <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Tiêu đề bài tập *
                                </label>
                                <input
                                    type="text"
                                    id="title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                    placeholder="Nhập tiêu đề bài tập..."
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Mô tả bài tập
                                </label>
                                <textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={4}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-gray-50 focus:bg-white resize-none"
                                    placeholder="Mô tả chi tiết về bài tập..."
                                />
                            </div>

                            <div>
                                <label htmlFor="dueDate" className="block text-sm font-semibold text-gray-700 mb-2">
                                    <Calendar className="w-4 h-4 inline mr-2" />
                                    Hạn nộp bài tập
                                </label>
                                <input
                                    type="datetime-local"
                                    id="dueDate"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    <div className="flex items-center gap-2">
                                        <Upload className="w-4 h-4 text-green-600" />
                                        Tệp đính kèm bài tập
                                    </div>
                                </label>

                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                                    <input
                                        type="file"
                                        multiple
                                        onChange={handleFileSelect}
                                        className="hidden"
                                        id="assignment-files"
                                        accept=".pdf,.doc,.docx,.txt,.zip,.jpg,.jpeg,.png,.gif,.mp4,.mov"
                                    />
                                    <label
                                        htmlFor="assignment-files"
                                        className="cursor-pointer flex flex-col items-center gap-2"
                                    >
                                        <Plus className="w-8 h-8 text-gray-400" />
                                        <span className="text-sm text-gray-600">
                                            Click để chọn file hoặc kéo thả vào đây
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            Hỗ trợ: PDF, DOC, DOCX, TXT, ZIP, JPG, PNG, MP4, MOV
                                        </span>
                                    </label>
                                </div>

                                {assignmentFiles.length > 0 && (
                                    <div className="mt-4">
                                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                                            File đã chọn ({assignmentFiles.length})
                                        </h4>
                                        <div className="space-y-3">
                                            {assignmentFiles.map((file, index) => (
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
                                                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500"
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

                                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="text-xs text-blue-600">💡</span>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-medium text-blue-900 mb-1">
                                                Hướng dẫn upload file
                                            </h4>
                                            <ul className="text-xs text-blue-700 space-y-1">
                                                <li>• Có thể upload nhiều file cùng lúc</li>
                                                <li>• Thêm mô tả cho từng file để học sinh hiểu rõ hơn</li>
                                                <li>• File sẽ được lưu trữ an toàn trên Cloudinary</li>
                                                <li>• Học sinh có thể tải xuống tất cả file</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            Gán cho học sinh
                        </h2>

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
                            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
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
        </div>
    );
}

export default CreateAssignment;
