import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, query, where, orderBy, serverTimestamp, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { useAuth } from '../../hooks/useAuth';
import { BookOpen, Plus, Edit, Trash2, Calendar, Clock, FileText, Video, Image, Download, Filter, Users, User, Share, UserCheck, Check, X, Lock, Upload, Search } from 'lucide-react';
import { SkeletonList } from '../Skeletons';

interface Lesson {
    id: string;
    title: string;
    description: string;
    content: string;
    type: 'text' | 'youtube' | 'document';
    file_url?: string;
    file_name?: string;
    youtube_url?: string;
    youtube_id?: string;
    created_at: unknown;
    updated_at: unknown;
    teacher_id: string;
    is_published: boolean;
    share_with_teachers: boolean; // Cho phép chia sẻ với giáo viên khác
    shared_with_teachers: string[]; // Danh sách ID của giáo viên được chia sẻ
    teacher_name?: string; // Thêm tên giáo viên để hiển thị
}

interface Teacher {
    id: string;
    full_name: string;
    email: string;
}

export function TeacherLessons() {
    const { profile } = useAuth();
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
    const [viewFilter, setViewFilter] = useState<'my' | 'all'>('my');
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Filter lessons based on search term
    const filteredLessons = lessons.filter(lesson =>
        lesson.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lesson.description && lesson.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (lesson.teacher_name && lesson.teacher_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        content: '',
        type: 'text' as 'text' | 'youtube' | 'document',
        file_url: '',
        file_name: '',
        youtube_url: '',
        youtube_id: '',
        is_published: true,
        share_with_teachers: true, // Mặc định chia sẻ với giáo viên khác
        shared_with_teachers: [] // Danh sách giáo viên được chia sẻ
    });

    // Function to handle file upload
    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const fileArray = Array.from(files);
            setUploadedFiles(prev => [...prev, ...fileArray]);

            // Upload files to Cloudinary
            const uploadPromises = fileArray.map(file =>
                uploadToCloudinary(file, `lessons/${profile?.id}`)
            );

            const uploadResults = await Promise.all(uploadPromises);

            // Set the first file as the main file
            if (uploadResults.length > 0) {
                setFormData(prev => ({
                    ...prev,
                    file_url: uploadResults[0].secure_url,
                    file_name: fileArray[0].name
                }));
            }
        } catch (error) {
            console.error('Error uploading files:', error);
            alert('Lỗi khi upload file. Vui lòng thử lại.');
        } finally {
            setUploading(false);
        }
    };

    // Function to remove uploaded file
    const removeUploadedFile = (index: number) => {
        setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    };

    // Function to extract YouTube ID from URL
    const extractYouTubeId = (url: string): string => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : '';
    };

    // Function to fetch all teachers
    const fetchTeachers = useCallback(async () => {
        try {
            const q = query(
                collection(db, 'profiles'),
                where('role', '==', 'teacher')
            );
            const querySnapshot = await getDocs(q);

            const teachersData = querySnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                .filter(teacher => teacher.id !== profile?.id) // Loại trừ chính mình
                .map(teacher => ({
                    id: teacher.id,
                    full_name: teacher.full_name || teacher.email?.split('@')[0] || 'Giáo viên',
                    email: teacher.email || ''
                })) as Teacher[];

            setTeachers(teachersData);
        } catch (error) {
            console.error('Error fetching teachers:', error);
        }
    }, [profile]);

    const fetchLessons = useCallback(async () => {
        if (!profile) return;

        try {
            let q;
            if (viewFilter === 'my') {
                // Chỉ lấy bài giảng của giáo viên hiện tại
                q = query(
                    collection(db, 'lessons'),
                    where('teacher_id', '==', profile.id)
                );
            } else {
                // Lấy tất cả bài giảng được chia sẻ với giáo viên khác
                // Firestore không hỗ trợ array-contains trong compound query, nên sẽ lọc ở client-side
                q = query(
                    collection(db, 'lessons'),
                    where('share_with_teachers', '==', true)
                );
            }

            const querySnapshot = await getDocs(q);

            let lessonsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Lesson[];

            // Lọc bỏ bài giảng của chính giáo viên và chỉ hiển thị bài giảng được chia sẻ với mình
            if (viewFilter === 'all') {
                lessonsData = lessonsData.filter(lesson =>
                    lesson.teacher_id !== profile.id &&
                    lesson.shared_with_teachers &&
                    lesson.shared_with_teachers.includes(profile.id)
                );
            }

            // Lấy thông tin tên giáo viên cho mỗi bài giảng
            const lessonsWithTeacherNames = await Promise.all(
                lessonsData.map(async (lesson) => {
                    try {
                        const teacherDoc = await getDoc(doc(db, 'profiles', lesson.teacher_id));
                        if (teacherDoc.exists()) {
                            const teacherData = teacherDoc.data();
                            return {
                                ...lesson,
                                teacher_name: teacherData.full_name || teacherData.email || 'Giáo viên'
                            };
                        }
                        return {
                            ...lesson,
                            teacher_name: 'Giáo viên'
                        };
                    } catch (error) {
                        console.error('Error fetching teacher name:', error);
                        return {
                            ...lesson,
                            teacher_name: 'Giáo viên'
                        };
                    }
                })
            );

            // Sort in JavaScript instead of Firestore
            lessonsWithTeacherNames.sort((a, b) => {
                const dateA = toDate(a.created_at);
                const dateB = toDate(b.created_at);
                return dateB.getTime() - dateA.getTime();
            });

            setLessons(lessonsWithTeacherNames);
        } catch (error) {
            console.error('Error fetching lessons:', error);
        } finally {
            setLoading(false);
        }
    }, [profile, viewFilter]);

    useEffect(() => {
        if (profile) {
            fetchLessons();
            fetchTeachers();
        }
    }, [profile, fetchLessons, fetchTeachers]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;

        try {
            // Extract YouTube ID if it's a YouTube lesson
            let youtubeId = '';
            if (formData.type === 'youtube' && formData.youtube_url) {
                youtubeId = extractYouTubeId(formData.youtube_url);
                if (!youtubeId) {
                    alert('URL YouTube không hợp lệ. Vui lòng kiểm tra lại.');
                    return;
                }
            }

            const lessonData = {
                ...formData,
                youtube_id: youtubeId,
                teacher_id: profile.id,
                shared_with_teachers: selectedTeachers,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };

            if (editingLesson) {
                await updateDoc(doc(db, 'lessons', editingLesson.id), {
                    ...formData,
                    youtube_id: youtubeId,
                    shared_with_teachers: selectedTeachers,
                    updated_at: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, 'lessons'), lessonData);
            }

            setFormData({
                title: '',
                description: '',
                content: '',
                type: 'text',
                file_url: '',
                file_name: '',
                youtube_url: '',
                youtube_id: '',
                is_published: true,
                share_with_teachers: true,
                shared_with_teachers: []
            });
            setSelectedTeachers([]);
            setUploadedFiles([]);
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingLesson(null);
            fetchLessons();
        } catch (error) {
            console.error('Error saving lesson:', error);
        }
    };

    const handleEdit = (lesson: Lesson) => {
        setFormData({
            title: lesson.title,
            description: lesson.description,
            content: lesson.content,
            type: lesson.type,
            file_url: lesson.file_url || '',
            file_name: lesson.file_name || '',
            youtube_url: lesson.youtube_url || '',
            youtube_id: lesson.youtube_id || '',
            is_published: lesson.is_published,
            share_with_teachers: lesson.share_with_teachers,
            shared_with_teachers: lesson.shared_with_teachers || []
        });
        setSelectedTeachers(lesson.shared_with_teachers || []);
        setEditingLesson(lesson);
        setShowEditModal(true);
    };

    const handleDelete = async (lessonId: string) => {
        if (!confirm('Bạn có chắc chắn muốn xóa bài giảng này?')) return;

        try {
            await deleteDoc(doc(db, 'lessons', lessonId));
            fetchLessons();
        } catch (error) {
            console.error('Error deleting lesson:', error);
        }
    };

    const handleViewLesson = (lesson: Lesson) => {
        setViewingLesson(lesson);
        setShowViewModal(true);
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

    if (loading) {
        return (
            <div className="bg-gray-100 p-6">
                <SkeletonList count={6} />
            </div>
        );
    }

    return (
        <>
            <div className="modern-bg-primary min-h-screen">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Header Section */}
                    <div className="mb-6 sm:mb-8">
                        <div className="modern-card-header p-6 sm:p-8 modern-animate-fade-in-up">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="flex items-center gap-3 sm:gap-4">
                                    <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg">
                                        <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                                    </div>
                                    <div>
                                        <h1 className="modern-heading-2">Bài giảng</h1>
                                        <p className="modern-text-muted mt-2">Quản lý và tạo bài giảng, chia sẻ với đồng nghiệp</p>
                                    </div>
                                </div>
                                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4">
                                    {/* Filter Buttons */}
                                    <div className="flex items-center gap-1 sm:gap-2 bg-white/50 backdrop-blur-sm rounded-2xl p-1 border border-white/20">
                                        <button
                                            onClick={() => setViewFilter('my')}
                                            className={`modern-btn ${viewFilter === 'my'
                                                ? 'modern-btn-primary'
                                                : 'modern-btn-secondary'
                                                }`}
                                        >
                                            <User className="w-4 h-4" />
                                            <span className="hidden sm:inline">Bài giảng của tôi</span>
                                            <span className="sm:hidden">Của tôi</span>
                                        </button>
                                        <button
                                            onClick={() => setViewFilter('all')}
                                            className={`modern-btn ${viewFilter === 'all'
                                                ? 'modern-btn-primary'
                                                : 'modern-btn-secondary'
                                                }`}
                                        >
                                            <Users className="w-4 h-4" />
                                            <span className="hidden sm:inline">Tất cả bài giảng</span>
                                            <span className="sm:hidden">Tất cả</span>
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowCreateModal(true);
                                            setEditingLesson(null);
                                            setSelectedTeachers([]);
                                            setFormData({
                                                title: '',
                                                description: '',
                                                content: '',
                                                type: 'text',
                                                file_url: '',
                                                file_name: '',
                                                youtube_url: '',
                                                youtube_id: '',
                                                is_published: true,
                                                share_with_teachers: true,
                                                shared_with_teachers: []
                                            });
                                        }}
                                        className="modern-btn modern-btn-primary"
                                    >
                                        <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                                        <span className="hidden sm:inline">Tạo bài giảng</span>
                                        <span className="sm:hidden">Tạo</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Create Modal */}
                    {showCreateModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-2 sm:p-4" style={{ position: 'fixed' }}>
                            <div className="modern-card-elevated w-full max-w-xs sm:max-w-md md:max-w-2xl lg:max-w-4xl hd-1366-modal-width max-h-[95vh] sm:max-h-[90vh] overflow-y-auto modern-scrollbar modern-animate-fade-in-scale">
                                {/* Modal Header */}
                                <div className="bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white p-6 sm:p-8 rounded-t-3xl">
                                    <div className="flex items-center gap-2 sm:gap-3">
                                        <div className="p-3 sm:p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
                                            <Plus className="w-6 h-6 sm:w-8 sm:h-8" />
                                        </div>
                                        <div>
                                            <h2 className="modern-heading-2 text-white">Tạo bài giảng mới</h2>
                                            <p className="text-blue-100 mt-2 hidden sm:block">Tạo bài giảng để chia sẻ kiến thức với học sinh</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Body */}
                                <div className="p-4 sm:p-6">
                                    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                    Tiêu đề bài giảng
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.title}
                                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                    className="modern-input"
                                                    placeholder="Nhập tiêu đề bài giảng..."
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                    Loại bài giảng
                                                </label>
                                                <select
                                                    value={formData.type}
                                                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'text' | 'youtube' | 'document' })}
                                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                                >
                                                    <option value="text">📝 Văn bản</option>
                                                    <option value="youtube">🎥 Video YouTube</option>
                                                    <option value="document">📄 Tài liệu</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Mô tả bài giảng
                                            </label>
                                            <textarea
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white resize-none"
                                                rows={3}
                                                placeholder="Mô tả ngắn gọn về nội dung bài giảng..."
                                            />
                                        </div>

                                        {formData.type === 'text' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Nội dung
                                                </label>
                                                <textarea
                                                    value={formData.content}
                                                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    rows={6}
                                                    required
                                                />
                                            </div>
                                        )}

                                        {formData.type === 'youtube' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Link YouTube
                                                </label>
                                                <input
                                                    type="url"
                                                    value={formData.youtube_url}
                                                    onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                                                    placeholder="https://www.youtube.com/watch?v=..."
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    required
                                                />
                                                <p className="text-sm text-gray-500 mt-1">
                                                    Dán link YouTube vào đây. Học sinh sẽ có thể xem video trực tiếp.
                                                </p>
                                            </div>
                                        )}

                                        {formData.type === 'document' && (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        Upload tài liệu
                                                    </label>
                                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                                                        <input
                                                            type="file"
                                                            multiple
                                                            onChange={(e) => handleFileUpload(e.target.files)}
                                                            className="hidden"
                                                            id="file-upload"
                                                            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.xls,.xlsx"
                                                        />
                                                        <label
                                                            htmlFor="file-upload"
                                                            className="cursor-pointer flex flex-col items-center gap-2"
                                                        >
                                                            <Upload className="w-8 h-8 text-gray-400" />
                                                            <span className="text-sm text-gray-600">
                                                                {uploading ? 'Đang upload...' : 'Chọn file hoặc kéo thả vào đây'}
                                                            </span>
                                                            <span className="text-xs text-gray-500">
                                                                Hỗ trợ: PDF, DOC, DOCX, PPT, PPTX, TXT, XLS, XLSX
                                                            </span>
                                                        </label>
                                                    </div>
                                                </div>

                                                {/* Hiển thị danh sách file đã upload */}
                                                {uploadedFiles.length > 0 && (
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            File đã chọn ({uploadedFiles.length})
                                                        </label>
                                                        <div className="space-y-2">
                                                            {uploadedFiles.map((file, index) => (
                                                                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                                                                    <div className="flex items-center gap-2">
                                                                        <FileText className="w-4 h-4 text-blue-500" />
                                                                        <span className="text-sm text-gray-700">{file.name}</span>
                                                                        <span className="text-xs text-gray-500">
                                                                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                                                        </span>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeUploadedFile(index)}
                                                                        className="text-red-500 hover:text-red-700 transition-colors"
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Fallback: Manual URL input */}
                                                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                                    <p className="text-sm text-yellow-800 mb-2">
                                                        Hoặc nhập URL tài liệu trực tiếp:
                                                    </p>
                                                    <div className="space-y-2">
                                                        <input
                                                            type="url"
                                                            value={formData.file_url}
                                                            onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                                                            placeholder="https://example.com/document.pdf"
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={formData.file_name}
                                                            onChange={(e) => setFormData({ ...formData, file_name: e.target.value })}
                                                            placeholder="Tên tài liệu"
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {/* Chia sẻ với giáo viên khác */}
                                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                                            <div className="flex items-center gap-3 mb-3">
                                                <Share className="w-5 h-5 text-blue-600" />
                                                <div className="flex-1">
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.share_with_teachers}
                                                            onChange={(e) => setFormData({ ...formData, share_with_teachers: e.target.checked })}
                                                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                                        />
                                                        <div>
                                                            <span className="text-sm font-semibold text-blue-900">
                                                                Chia sẻ với giáo viên khác
                                                            </span>
                                                            <p className="text-xs text-blue-700 mt-1">
                                                                Cho phép các giáo viên khác xem bài giảng này
                                                            </p>
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Chọn giáo viên cụ thể */}
                                            {formData.share_with_teachers && (
                                                <div className="mt-3 p-3 bg-white rounded-lg border border-blue-200">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <UserCheck className="w-4 h-4 text-blue-600" />
                                                        <span className="text-sm font-semibold text-blue-900">
                                                            Chọn giáo viên cụ thể
                                                        </span>
                                                    </div>
                                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                                        {teachers.map((teacher) => (
                                                            <label key={teacher.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedTeachers.includes(teacher.id)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setSelectedTeachers([...selectedTeachers, teacher.id]);
                                                                        } else {
                                                                            setSelectedTeachers(selectedTeachers.filter(id => id !== teacher.id));
                                                                        }
                                                                    }}
                                                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                                                />
                                                                <div className="flex-1">
                                                                    <span className="text-sm font-medium text-gray-900">
                                                                        {teacher.full_name}
                                                                    </span>
                                                                    <p className="text-xs text-gray-500">
                                                                        {teacher.email}
                                                                    </p>
                                                                </div>
                                                                {selectedTeachers.includes(teacher.id) && (
                                                                    <Check className="w-4 h-4 text-green-600" />
                                                                )}
                                                            </label>
                                                        ))}
                                                    </div>
                                                    {selectedTeachers.length > 0 && (
                                                        <div className="mt-3 p-2 bg-green-50 rounded-lg border border-green-200">
                                                            <p className="text-xs text-green-700">
                                                                Đã chọn {selectedTeachers.length} giáo viên
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Modal Footer */}
                                        <div className="flex gap-3 pt-6 border-t border-gray-200">
                                            <button
                                                type="submit"
                                                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
                                            >
                                                ✨ Tạo bài giảng
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowCreateModal(false);
                                                    setEditingLesson(null);
                                                }}
                                                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all duration-200 font-semibold"
                                            >
                                                Hủy
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Edit Modal */}
                    {showEditModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" style={{ position: 'fixed' }}>
                            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto scrollbar-hide">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                                    Chỉnh sửa bài giảng
                                </h2>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Tiêu đề
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Mô tả
                                        </label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            rows={3}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Loại bài giảng
                                        </label>
                                        <select
                                            value={formData.type}
                                            onChange={(e) => setFormData({ ...formData, type: e.target.value as 'text' | 'youtube' | 'document' })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="text">Văn bản</option>
                                            <option value="youtube">Video YouTube</option>
                                            <option value="document">Tài liệu</option>
                                        </select>
                                    </div>

                                    {formData.type === 'text' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Nội dung
                                            </label>
                                            <textarea
                                                value={formData.content}
                                                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                rows={6}
                                                required
                                            />
                                        </div>
                                    )}

                                    {formData.type === 'youtube' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Link YouTube
                                            </label>
                                            <input
                                                type="url"
                                                value={formData.youtube_url}
                                                onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                                                placeholder="https://www.youtube.com/watch?v=..."
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                required
                                            />
                                            <p className="text-sm text-gray-500 mt-1">
                                                Dán link YouTube vào đây. Học sinh sẽ có thể xem video trực tiếp.
                                            </p>
                                        </div>
                                    )}

                                    {formData.type === 'document' && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Upload tài liệu
                                                </label>
                                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                                                    <input
                                                        type="file"
                                                        multiple
                                                        onChange={(e) => handleFileUpload(e.target.files)}
                                                        className="hidden"
                                                        id="file-upload-edit"
                                                        accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.xls,.xlsx"
                                                    />
                                                    <label
                                                        htmlFor="file-upload-edit"
                                                        className="cursor-pointer flex flex-col items-center gap-2"
                                                    >
                                                        <Upload className="w-6 h-6 text-gray-400" />
                                                        <span className="text-sm text-gray-600">
                                                            {uploading ? 'Đang upload...' : 'Chọn file mới'}
                                                        </span>
                                                        <span className="text-xs text-gray-500">
                                                            Hỗ trợ: PDF, DOC, DOCX, PPT, PPTX, TXT, XLS, XLSX
                                                        </span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Hiển thị danh sách file đã upload */}
                                            {uploadedFiles.length > 0 && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        File đã chọn ({uploadedFiles.length})
                                                    </label>
                                                    <div className="space-y-2">
                                                        {uploadedFiles.map((file, index) => (
                                                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border">
                                                                <div className="flex items-center gap-2">
                                                                    <FileText className="w-4 h-4 text-blue-500" />
                                                                    <span className="text-sm text-gray-700">{file.name}</span>
                                                                    <span className="text-xs text-gray-500">
                                                                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeUploadedFile(index)}
                                                                    className="text-red-500 hover:text-red-700 transition-colors"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Fallback: Manual URL input */}
                                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                                <p className="text-sm text-yellow-800 mb-2">
                                                    Hoặc nhập URL tài liệu trực tiếp:
                                                </p>
                                                <div className="space-y-2">
                                                    <input
                                                        type="url"
                                                        value={formData.file_url}
                                                        onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                                                        placeholder="https://example.com/document.pdf"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={formData.file_name}
                                                        onChange={(e) => setFormData({ ...formData, file_name: e.target.value })}
                                                        placeholder="Tên tài liệu"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Chia sẻ với giáo viên khác */}
                                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Share className="w-4 h-4 text-blue-600" />
                                            <div className="flex-1">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.share_with_teachers}
                                                        onChange={(e) => setFormData({ ...formData, share_with_teachers: e.target.checked })}
                                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                                    />
                                                    <div>
                                                        <span className="text-sm font-semibold text-blue-900">
                                                            Chia sẻ với giáo viên khác
                                                        </span>
                                                        <p className="text-xs text-blue-700 mt-1">
                                                            Cho phép các giáo viên khác xem bài giảng này
                                                        </p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Chọn giáo viên cụ thể */}
                                        {formData.share_with_teachers && (
                                            <div className="mt-3 p-3 bg-white rounded-lg border border-blue-200">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <UserCheck className="w-4 h-4 text-blue-600" />
                                                    <span className="text-sm font-semibold text-blue-900">
                                                        Chọn giáo viên cụ thể
                                                    </span>
                                                </div>
                                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                                    {teachers.map((teacher) => (
                                                        <label key={teacher.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedTeachers.includes(teacher.id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setSelectedTeachers([...selectedTeachers, teacher.id]);
                                                                    } else {
                                                                        setSelectedTeachers(selectedTeachers.filter(id => id !== teacher.id));
                                                                    }
                                                                }}
                                                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                                            />
                                                            <div className="flex-1">
                                                                <span className="text-sm font-medium text-gray-900">
                                                                    {teacher.full_name}
                                                                </span>
                                                                <p className="text-xs text-gray-500">
                                                                    {teacher.email}
                                                                </p>
                                                            </div>
                                                            {selectedTeachers.includes(teacher.id) && (
                                                                <Check className="w-4 h-4 text-green-600" />
                                                            )}
                                                        </label>
                                                    ))}
                                                </div>
                                                {selectedTeachers.length > 0 && (
                                                    <div className="mt-3 p-2 bg-green-50 rounded-lg border border-green-200">
                                                        <p className="text-xs text-green-700">
                                                            Đã chọn {selectedTeachers.length} giáo viên
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                                        >
                                            Cập nhật
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowEditModal(false);
                                                setEditingLesson(null);
                                            }}
                                            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                        >
                                            Hủy
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* Search Bar */}
                    {lessons.length > 0 && (
                        <div className="mb-6">
                            <div className="relative max-w-md">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Tìm kiếm bài giảng theo tiêu đề, mô tả hoặc tác giả..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                />
                            </div>
                        </div>
                    )}

                    {lessons.length === 0 ? (
                        <div className="modern-card p-12 text-center modern-animate-fade-in-up">
                            <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full w-24 h-24 mx-auto mb-8 flex items-center justify-center">
                                <BookOpen className="w-12 h-12 text-blue-500" />
                            </div>
                            <h3 className="modern-heading-2 mb-4">Chưa có bài giảng nào</h3>
                            <p className="modern-text-body text-gray-600 mb-8 max-w-md mx-auto">
                                Hãy tạo bài giảng đầu tiên để chia sẻ kiến thức với học sinh và đồng nghiệp.
                            </p>
                            <button
                                onClick={() => {
                                    setShowCreateModal(true);
                                    setEditingLesson(null);
                                    setSelectedTeachers([]);
                                    setFormData({
                                        title: '',
                                        description: '',
                                        content: '',
                                        type: 'text',
                                        file_url: '',
                                        file_name: '',
                                        youtube_url: '',
                                        youtube_id: '',
                                        is_published: true,
                                        share_with_teachers: true,
                                        shared_with_teachers: []
                                    });
                                }}
                                className="modern-btn modern-btn-primary"
                            >
                                <Plus className="w-5 h-5" />
                                Tạo bài giảng đầu tiên
                            </button>
                        </div>
                    ) : filteredLessons.length === 0 && searchTerm ? (
                        <div className="modern-card p-12 text-center modern-animate-fade-in-up">
                            <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full w-24 h-24 mx-auto mb-8 flex items-center justify-center">
                                <Search className="w-12 h-12 text-gray-500" />
                            </div>
                            <h3 className="modern-heading-2 mb-4">Không tìm thấy bài giảng nào</h3>
                            <p className="modern-text-body text-gray-600 mb-8 max-w-md mx-auto">
                                Không có bài giảng nào khớp với từ khóa "{searchTerm}"
                            </p>
                            <button
                                onClick={() => setSearchTerm('')}
                                className="modern-btn modern-btn-secondary"
                            >
                                <X className="w-5 h-5" />
                                Xóa bộ lọc
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {filteredLessons.map((lesson) => (
                                <div key={lesson.id} className="modern-card lesson-card modern-animate-fade-in-scale lesson-card-hover group cursor-pointer" onClick={() => handleViewLesson(lesson)}>
                                    <div className="lesson-card-content">
                                        {/* Video/Media Section - Moved to top */}
                                        {lesson.type === 'youtube' && lesson.youtube_id && (
                                            <div className="relative w-full h-44 bg-gray-100 rounded-lg overflow-hidden mb-2">
                                                <iframe
                                                    width="100%"
                                                    height="100%"
                                                    src={`https://www.youtube.com/embed/${lesson.youtube_id}`}
                                                    title={lesson.title}
                                                    frameBorder="0"
                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                    allowFullScreen
                                                    className="rounded-lg"
                                                ></iframe>
                                            </div>
                                        )}

                                        {/* Header Section */}
                                        <div className="lesson-card-header">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="flex-shrink-0 p-1.5 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100">
                                                    {lesson.type === 'youtube' ? (
                                                        <Video className="w-4 h-4 text-red-500" />
                                                    ) : lesson.type === 'document' ? (
                                                        <FileText className="w-4 h-4 text-blue-500" />
                                                    ) : (
                                                        <BookOpen className="w-4 h-4 text-green-500" />
                                                    )}
                                                </div>
                                                <span className="lesson-type-badge text-xs px-2 py-1 rounded-full">
                                                    {lesson.type === 'youtube' ? 'Video' : lesson.type === 'document' ? 'Tài liệu' : 'Văn bản'}
                                                </span>
                                            </div>
                                            <h3 className="text-base font-semibold text-gray-900 truncate leading-tight mb-2">
                                                {lesson.title}
                                            </h3>
                                        </div>

                                        {/* Body Section */}
                                        <div className="lesson-card-body">
                                            <div className="flex-1">
                                                {lesson.description && (
                                                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed mb-1">
                                                        {lesson.description}
                                                    </p>
                                                )}

                                                {/* Preview Content */}
                                                {lesson.type === 'text' && lesson.content && (
                                                    <div className="lesson-preview-content mb-1">
                                                        <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed">
                                                            {lesson.content}
                                                        </p>
                                                    </div>
                                                )}

                                                {lesson.type === 'document' && lesson.file_url && (
                                                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-blue-600 bg-blue-50 rounded-md mb-1">
                                                        <Download className="w-3 h-3" />
                                                        <span className="truncate">{lesson.file_name}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Metadata */}
                                            <div className="text-xs text-gray-500 space-y-1 mt-2">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    <span>{toDate(lesson.created_at).toLocaleDateString('vi-VN')}</span>
                                                </div>
                                                {viewFilter === 'all' && lesson.teacher_name && (
                                                    <div className="flex items-center gap-1">
                                                        <User className="w-3 h-3" />
                                                        <span className="truncate">{lesson.teacher_name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Footer Section */}
                                        <div className="lesson-card-footer">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {lesson.teacher_id === profile?.id && (
                                                        <span className={`modern-badge ${lesson.share_with_teachers
                                                            ? 'modern-badge-success'
                                                            : 'modern-badge-primary'
                                                            }`}>
                                                            <Share className="w-3 h-3" />
                                                            {lesson.share_with_teachers
                                                                ? `Chia sẻ với ${lesson.shared_with_teachers?.length || 0} giáo viên`
                                                                : 'Riêng tư'
                                                            }
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Actions Section */}
                                                <div className="flex flex-row gap-1 flex-shrink-0">
                                                    {/* Chỉ hiển thị nút chỉnh sửa/xóa cho bài giảng của chính giáo viên */}
                                                    {lesson.teacher_id === profile?.id && (
                                                        <>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleEdit(lesson);
                                                                }}
                                                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                                                                title="Chỉnh sửa"
                                                            >
                                                                <Edit className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDelete(lesson.id);
                                                                }}
                                                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                                                                title="Xóa"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </>
                                                    )}
                                                    {/* Hiển thị badge cho bài giảng của giáo viên khác (chỉ khi xem "Tất cả bài giảng") */}
                                                    {viewFilter === 'all' && lesson.teacher_id !== profile?.id && (
                                                        <div className="modern-badge modern-badge-primary">
                                                            <User className="w-3 h-3" />
                                                            <span className="truncate">Của {lesson.teacher_name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* View Lesson Modal */}
            {showViewModal && viewingLesson && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4" style={{ position: 'fixed' }}>
                    <div className="modern-card-elevated lesson-view-modal modern-animate-fade-in-scale">
                        <div className="lesson-view-modal-content">
                            {/* Modal Header */}
                            <div className="lesson-view-modal-header">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white/20 rounded-lg">
                                            {viewingLesson.type === 'youtube' ? (
                                                <Video className="w-5 h-5" />
                                            ) : viewingLesson.type === 'document' ? (
                                                <FileText className="w-5 h-5" />
                                            ) : (
                                                <BookOpen className="w-5 h-5" />
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold truncate">{viewingLesson.title}</h3>
                                            <p className="text-blue-100 text-sm">
                                                {viewingLesson.type === 'youtube' ? 'Video' : viewingLesson.type === 'document' ? 'Tài liệu' : 'Văn bản'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowViewModal(false)}
                                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="lesson-view-modal-body">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Left Column - Content */}
                                    <div className="space-y-6">
                                        {viewingLesson.description && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-3">Mô tả</h4>
                                                <p className="text-base text-gray-700 leading-relaxed">{viewingLesson.description}</p>
                                            </div>
                                        )}

                                        {viewingLesson.type === 'text' && viewingLesson.content && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-3">Nội dung</h4>
                                                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                                    <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">
                                                        {viewingLesson.content}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {viewingLesson.type === 'document' && viewingLesson.file_url && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-3">Tài liệu</h4>
                                                <button
                                                    onClick={() => handleDownload(viewingLesson.file_url!, viewingLesson.file_name!)}
                                                    className="flex items-center gap-3 px-6 py-4 text-base text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-xl transition-colors w-full border border-blue-200"
                                                >
                                                    <Download className="w-6 h-6" />
                                                    <span className="font-medium">{viewingLesson.file_name}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column - Media & Info */}
                                    <div className="space-y-6">
                                        {viewingLesson.type === 'youtube' && viewingLesson.youtube_id && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-3">Video</h4>
                                                <div className="relative w-full aspect-video bg-gray-100 rounded-xl overflow-hidden shadow-lg">
                                                    <iframe
                                                        width="100%"
                                                        height="100%"
                                                        src={`https://www.youtube.com/embed/${viewingLesson.youtube_id}`}
                                                        title={viewingLesson.title}
                                                        frameBorder="0"
                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                        allowFullScreen
                                                        className="rounded-xl"
                                                    ></iframe>
                                                </div>
                                            </div>
                                        )}

                                        {/* Lesson Information */}
                                        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                            <h4 className="text-lg font-semibold text-gray-900 mb-4">Thông tin bài giảng</h4>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <Calendar className="w-5 h-5 text-gray-500" />
                                                    <div>
                                                        <p className="text-sm text-gray-500">Ngày tạo</p>
                                                        <p className="text-base font-medium text-gray-900">{toDate(viewingLesson.created_at).toLocaleDateString('vi-VN')}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Clock className="w-5 h-5 text-gray-500" />
                                                    <div>
                                                        <p className="text-sm text-gray-500">Cập nhật lần cuối</p>
                                                        <p className="text-base font-medium text-gray-900">{toDate(viewingLesson.updated_at).toLocaleDateString('vi-VN')}</p>
                                                    </div>
                                                </div>
                                                {viewingLesson.teacher_name && (
                                                    <div className="flex items-center gap-3">
                                                        <User className="w-5 h-5 text-gray-500" />
                                                        <div>
                                                            <p className="text-sm text-gray-500">Tác giả</p>
                                                            <p className="text-base font-medium text-gray-900">{viewingLesson.teacher_name}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-3">
                                                    <FileText className="w-5 h-5 text-gray-500" />
                                                    <div>
                                                        <p className="text-sm text-gray-500">Loại bài giảng</p>
                                                        <p className="text-base font-medium text-gray-900">
                                                            {viewingLesson.type === 'youtube' ? 'Video' : viewingLesson.type === 'document' ? 'Tài liệu' : 'Văn bản'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="lesson-view-modal-footer">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {viewingLesson.share_with_teachers ? (
                                            <span className="modern-badge modern-badge-success">
                                                <Share className="w-3 h-3" />
                                                Chia sẻ với {viewingLesson.shared_with_teachers?.length || 0} giáo viên
                                            </span>
                                        ) : (
                                            <span className="modern-badge modern-badge-primary">
                                                <Lock className="w-3 h-3" />
                                                Riêng tư
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setShowViewModal(false)}
                                        className="modern-btn modern-btn-secondary"
                                    >
                                        Đóng
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
