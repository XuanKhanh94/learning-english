import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db, Profile, AssignmentFile } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { Upload, Users, Calendar, FileText, Plus, X, Search, BookOpen } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface CreateAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

function CreateAssignmentModal({ isOpen, onClose, onSuccess }: CreateAssignmentModalProps) {
    const { profile } = useAuth();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [assignmentFiles, setAssignmentFiles] = useState<File[]>([]);
    const [fileDescriptions, setFileDescriptions] = useState<{ [key: string]: string }>({});
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [students, setStudents] = useState<Profile[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingStudents, setLoadingStudents] = useState(true);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchStudents();
            fetchClasses();
        }
    }, [isOpen]);

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

    const fetchClasses = async () => {
        setLoadingClasses(true);
        try {
            const q = query(collection(db, 'classes'));
            const querySnapshot = await getDocs(q);

            const classesData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setClasses(classesData);
        } catch (error) {
            console.error('Error fetching classes:', error);
        } finally {
            setLoadingClasses(false);
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

            const assignmentData: any = {
                title,
                description,
                teacher_id: profile.id,
                due_date: dueDate || null,
                created_at: serverTimestamp(),
            };

            // Only add file_url and file_name if file exists
            if (fileUrl && fileName) {
                assignmentData.file_url = fileUrl;
                assignmentData.file_name = fileName;
            }

            // Only add files array if there are uploaded files
            if (uploadedFiles.length > 0) {
                assignmentData.files = uploadedFiles;
            }

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

            // Reset form
            setTitle('');
            setDescription('');
            setDueDate('');
            setFile(null);
            setAssignmentFiles([]);
            setFileDescriptions({});
            setSelectedStudents([]);

            onSuccess();
            onClose();
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

    const handleSelectAll = () => {
        if (selectedStudents.length === filteredStudents.length) {
            setSelectedStudents([]);
        } else {
            setSelectedStudents(filteredStudents.map(student => student.id));
        }
    };

    const handleClassSelect = (classId: string) => {
        // Auto-select all students from the selected class
        const selectedClass = classes.find(c => c.id === classId);
        if (selectedClass) {
            // TODO: Get actual students from the class
            // For now, just select all available students as a demo
            setSelectedStudents(students.map(student => student.id));
        }
    };

    // Filter students and classes based on search term
    const filteredStudents = useMemo(() => {
        if (!searchTerm.trim()) return students;

        return students.filter(student =>
            student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [students, searchTerm]);

    const filteredClasses = useMemo(() => {
        if (!searchTerm.trim()) return classes;

        return classes.filter(classItem =>
            classItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            classItem.subject.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [classes, searchTerm]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-xl">
                                <FileText className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">Tạo bài tập mới</h2>
                                <p className="text-sm text-gray-600">Tạo bài tập và gán cho học sinh</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* Modal Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {/* Basic Information */}
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Tiêu đề bài tập *
                                </label>
                                <input
                                    type="text"
                                    id="title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white"
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
                                    rows={3}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white resize-none"
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
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                />
                            </div>
                        </div>

                        {/* File Upload */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-3">
                                <Upload className="w-4 h-4 inline mr-2" />
                                Tệp đính kèm
                            </label>
                            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors">
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
                                    <span className="text-sm text-gray-600">Click để chọn file</span>
                                    <span className="text-xs text-gray-500">PDF, DOC, DOCX, TXT, ZIP, JPG, PNG, MP4, MOV</span>
                                </label>
                            </div>

                            {assignmentFiles.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {assignmentFiles.map((file, index) => (
                                        <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                            <FileText className="w-4 h-4 text-gray-500" />
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => removeFile(index)}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Unified Search and Selection */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-semibold text-gray-700">
                                    <Users className="w-4 h-4 inline mr-2" />
                                    Tìm kiếm và chọn học sinh/lớp học
                                </label>
                                {filteredStudents.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleSelectAll}
                                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        {selectedStudents.length === filteredStudents.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                    </button>
                                )}
                            </div>

                            {/* Unified Search Input */}
                            <div className="mb-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Tìm kiếm học sinh theo tên/email hoặc lớp học theo tên/môn học..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {loadingStudents || loadingClasses ? (
                                <div className="flex items-center justify-center py-4">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                                    <span className="ml-2 text-gray-600 text-sm">Đang tải...</span>
                                </div>
                            ) : (
                                <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-3">
                                    {/* Show classes first if there are filtered classes */}
                                    {filteredClasses.length > 0 && (
                                        <div className="mb-4">
                                            <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                                <BookOpen className="w-4 h-4" />
                                                Lớp học ({filteredClasses.length})
                                            </h4>
                                            <div className="space-y-2">
                                                {filteredClasses.map((classItem) => (
                                                    <div
                                                        key={classItem.id}
                                                        onClick={() => handleClassSelect(classItem.id)}
                                                        className="flex items-center p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
                                                    >
                                                        <div className="flex-1">
                                                            <p className="text-sm font-semibold text-gray-900">{classItem.name}</p>
                                                            <p className="text-xs text-gray-500">{classItem.subject} • {classItem.student_count} học sinh</p>
                                                        </div>
                                                        <div className="text-blue-600 text-xs">
                                                            Chọn lớp
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Show students */}
                                    {filteredStudents.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                                <Users className="w-4 h-4" />
                                                Học sinh ({filteredStudents.length})
                                            </h4>
                                            <div className="space-y-1">
                                                {filteredStudents.map((student) => (
                                                    <label key={student.id} className="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedStudents.includes(student.id)}
                                                            onChange={() => handleStudentToggle(student.id)}
                                                            className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                        />
                                                        <div className="flex-1">
                                                            <p className="text-sm font-medium text-gray-900">{student.full_name}</p>
                                                            <p className="text-xs text-gray-500">{student.email}</p>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* No results */}
                                    {filteredStudents.length === 0 && filteredClasses.length === 0 && searchTerm && (
                                        <div className="text-center py-4">
                                            <Search className="mx-auto h-6 w-6 text-gray-400" />
                                            <p className="text-sm text-gray-500 mt-1">
                                                Không tìm thấy học sinh hoặc lớp học nào với từ khóa "{searchTerm}"
                                            </p>
                                        </div>
                                    )}

                                    {/* Show all when no search */}
                                    {!searchTerm && students.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                                <Users className="w-4 h-4" />
                                                Tất cả học sinh ({students.length})
                                            </h4>
                                            <div className="space-y-1">
                                                {students.map((student) => (
                                                    <label key={student.id} className="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedStudents.includes(student.id)}
                                                            onChange={() => handleStudentToggle(student.id)}
                                                            className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                        />
                                                        <div className="flex-1">
                                                            <p className="text-sm font-medium text-gray-900">{student.full_name}</p>
                                                            <p className="text-xs text-gray-500">{student.email}</p>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedStudents.length > 0 && (
                                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-4 h-4 text-blue-600" />
                                        <p className="text-sm font-medium text-blue-700">
                                            Đã chọn {selectedStudents.length} học sinh
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !title.trim()}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors"
                            >
                                {loading ? 'Đang tạo...' : 'Tạo bài tập'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default CreateAssignmentModal;
