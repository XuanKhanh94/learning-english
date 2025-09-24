import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, query, where, orderBy, serverTimestamp, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, Lesson } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { BookOpen, Plus, Edit, Trash2, Calendar, Clock, FileText, Video, Image, Download, Filter, Users, User } from 'lucide-react';
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
    teacher_name?: string; // Thêm tên giáo viên để hiển thị
}

export function TeacherLessons() {
    const { profile } = useAuth();
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
    const [viewFilter, setViewFilter] = useState<'my' | 'all'>('my');
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        content: '',
        type: 'text' as 'text' | 'youtube' | 'document',
        file_url: '',
        file_name: '',
        youtube_url: '',
        youtube_id: '',
        is_published: true
    });

    // Function to extract YouTube ID from URL
    const extractYouTubeId = (url: string): string => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : '';
    };

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
                // Lấy tất cả bài giảng
                q = query(
                    collection(db, 'lessons')
                );
            }

            const querySnapshot = await getDocs(q);

            const lessonsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Lesson[];

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
        }
    }, [profile, fetchLessons]);

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
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };

            if (editingLesson) {
                await updateDoc(doc(db, 'lessons', editingLesson.id), {
                    ...formData,
                    youtube_id: youtubeId,
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
                is_published: true
            });
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
            is_published: lesson.is_published
        });
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
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Header Section */}
                    <div className="mb-8">
                        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-blue-100 rounded-xl">
                                        <BookOpen className="w-8 h-8 text-blue-600" />
                                    </div>
                                    <div>
                                        <h1 className="text-3xl font-bold text-gray-900">Bài giảng</h1>
                                        <p className="text-gray-600 mt-1">Quản lý và tạo bài giảng cho học sinh</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {/* Filter Buttons */}
                                    <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                                        <button
                                            onClick={() => setViewFilter('my')}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${viewFilter === 'my'
                                                ? 'bg-white text-blue-600 shadow-sm'
                                                : 'text-gray-600 hover:text-gray-900'
                                                }`}
                                        >
                                            <User className="w-4 h-4" />
                                            Bài giảng của tôi
                                        </button>
                                        <button
                                            onClick={() => setViewFilter('all')}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${viewFilter === 'all'
                                                ? 'bg-white text-blue-600 shadow-sm'
                                                : 'text-gray-600 hover:text-gray-900'
                                                }`}
                                        >
                                            <Users className="w-4 h-4" />
                                            Tất cả bài giảng
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowCreateModal(true);
                                            setEditingLesson(null);
                                            setFormData({
                                                title: '',
                                                description: '',
                                                content: '',
                                                type: 'text',
                                                file_url: '',
                                                file_name: '',
                                                youtube_url: '',
                                                youtube_id: '',
                                                is_published: true
                                            });
                                        }}
                                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                                    >
                                        <Plus className="w-5 h-5" />
                                        Tạo bài giảng
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Create Modal */}
                    {showCreateModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4" style={{ position: 'fixed' }}>
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-hide">
                                {/* Modal Header */}
                                <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-t-2xl">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                                            <Plus className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold">Tạo bài giảng mới</h2>
                                            <p className="text-blue-100 mt-1">Tạo bài giảng để chia sẻ kiến thức với học sinh</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Body */}
                                <div className="p-6">
                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                    Tiêu đề bài giảng
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.title}
                                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white"
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
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        URL tệp
                                                    </label>
                                                    <input
                                                        type="url"
                                                        value={formData.file_url}
                                                        onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Tên tệp
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={formData.file_name}
                                                        onChange={(e) => setFormData({ ...formData, file_name: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        required
                                                    />
                                                </div>
                                            </>
                                        )}

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
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    URL tệp
                                                </label>
                                                <input
                                                    type="url"
                                                    value={formData.file_url}
                                                    onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Tên tệp
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.file_name}
                                                    onChange={(e) => setFormData({ ...formData, file_name: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    required
                                                />
                                            </div>
                                        </>
                                    )}

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

                    {lessons.length === 0 ? (
                        <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-200">
                            <div className="p-4 bg-gray-100 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                                <BookOpen className="w-10 h-10 text-gray-400" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">Chưa có bài giảng nào</h3>
                            <p className="text-gray-600 mb-6">
                                Hãy tạo bài giảng đầu tiên để chia sẻ kiến thức với học sinh.
                            </p>
                            <button
                                onClick={() => {
                                    setShowCreateModal(true);
                                    setEditingLesson(null);
                                    setFormData({
                                        title: '',
                                        description: '',
                                        content: '',
                                        type: 'text',
                                        file_url: '',
                                        file_name: '',
                                        youtube_url: '',
                                        youtube_id: '',
                                        is_published: true
                                    });
                                }}
                                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
                            >
                                <Plus className="w-5 h-5 inline mr-2" />
                                Tạo bài giảng đầu tiên
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-6">
                            {lessons.map((lesson) => (
                                <div key={lesson.id} className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                {lesson.type === 'youtube' ? (
                                                    <Video className="w-5 h-5 text-red-500" />
                                                ) : lesson.type === 'document' ? (
                                                    <FileText className="w-5 h-5 text-blue-500" />
                                                ) : (
                                                    <BookOpen className="w-5 h-5 text-green-500" />
                                                )}
                                                <h3 className="text-lg font-semibold text-gray-900">
                                                    {lesson.title}
                                                </h3>
                                            </div>

                                            {lesson.description && (
                                                <p className="text-gray-700 mb-4">
                                                    {lesson.description}
                                                </p>
                                            )}

                                            <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-4 h-4" />
                                                    Tạo: {toDate(lesson.created_at).toLocaleDateString('vi-VN')}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-4 h-4" />
                                                    Cập nhật: {toDate(lesson.updated_at).toLocaleDateString('vi-VN')}
                                                </span>
                                                {viewFilter === 'all' && lesson.teacher_name && (
                                                    <span className="flex items-center gap-1">
                                                        <User className="w-4 h-4" />
                                                        Tác giả: {lesson.teacher_name}
                                                    </span>
                                                )}
                                            </div>

                                            {lesson.type === 'text' && lesson.content && (
                                                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                                    <p className="text-sm text-gray-700 line-clamp-3">
                                                        {lesson.content}
                                                    </p>
                                                </div>
                                            )}

                                            {lesson.type === 'youtube' && lesson.youtube_id && (
                                                <div className="mb-4">
                                                    <div className="relative w-full max-w-md">
                                                        <iframe
                                                            width="100%"
                                                            height="200"
                                                            src={`https://www.youtube.com/embed/${lesson.youtube_id}`}
                                                            title={lesson.title}
                                                            frameBorder="0"
                                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                            allowFullScreen
                                                            className="rounded-lg"
                                                        ></iframe>
                                                    </div>
                                                </div>
                                            )}

                                            {lesson.type === 'document' && lesson.file_url && (
                                                <div className="mb-4">
                                                    <button
                                                        onClick={() => handleDownload(lesson.file_url!, lesson.file_name!)}
                                                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                        {lesson.file_name}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2 ml-4">
                                            {/* Chỉ hiển thị nút chỉnh sửa/xóa cho bài giảng của chính giáo viên */}
                                            {lesson.teacher_id === profile?.id && (
                                                <>
                                                    <button
                                                        onClick={() => handleEdit(lesson)}
                                                        className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200 font-medium"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                        Chỉnh sửa
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(lesson.id)}
                                                        className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 font-medium"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        Xóa
                                                    </button>
                                                </>
                                            )}
                                            {/* Hiển thị badge cho bài giảng của giáo viên khác */}
                                            {lesson.teacher_id !== profile?.id && (
                                                <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 bg-gray-100 rounded-xl">
                                                    <User className="w-4 h-4" />
                                                    Bài giảng của {lesson.teacher_name}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
